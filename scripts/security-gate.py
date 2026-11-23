#!/usr/bin/env python3
"""Run pinned source, secret and dependency checks on the candidate snapshot."""

from datetime import date
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SEMGREP_VERSION = "1.186.0"
GITLEAKS_VERSION = "8.30.1"
RULES = ROOT / "security/semgrep.yml"


def run(args, *, cwd=ROOT, expected=(0,)):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode not in expected:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-4000:]}")
    return result


def read_report(path):
    if not path.is_file():
        raise RuntimeError(f"Scanner produced no report: {path.name}")
    return json.loads(path.read_text())


def semgrep(target, report, *, config=RULES):
    result = run([
        "semgrep", "scan", "--config", str(config), "--metrics=off",
        "--disable-version-check", "--strict", "--error", "--no-git-ignore",
        "--json-output", str(report), str(target),
    ], expected=(0, 1, 2, 3, 4, 5, 7, 8, 13, 14))
    data = read_report(report)
    errors = data.get("errors", [])
    if errors:
        raise RuntimeError(f"Semgrep errors: {json.dumps(errors)}")
    if result.returncode not in (0, 1):
        raise RuntimeError(f"Semgrep failed ({result.returncode})")
    return data


def leaks(binary, target, report):
    result = run([
        binary, "dir", str(target), "--no-banner", "--redact=100",
        "--report-format", "json", "--report-path", str(report),
    ], expected=(0, 1))
    data = read_report(report)
    if (result.returncode == 1) != bool(data):
        raise RuntimeError("Gitleaks exit status disagrees with its findings")
    return data


def controls(binary, temp):
    positive = temp / "positive"
    positive.mkdir()
    examples = {
        "no-dynamic-code": "eval(input);",
        "no-shell-execution": 'import child_process from "node:child_process"; child_process.exec(input);',
        "no-unsafe-html": "element.innerHTML = input;",
        "no-tls-bypass": "const options = { rejectUnauthorized: false };",
        "parameterized-sql": "db.query(`SELECT * FROM users WHERE id=${input}`);",
        "explicit-gcm-tag-length": 'createDecipheriv("aes-256-gcm", key, iv);',
        "no-sensitive-console-logging": "console.log(request.headers);",
    }
    for rule, source in examples.items():
        (positive / f"{rule}.ts").write_text(source)
    found = semgrep(positive, temp / "positive.json")
    ids = {item["check_id"].split(".")[-1] for item in found["results"]}
    if ids != set(examples):
        raise RuntimeError(f"SAST positive controls failed: {sorted(ids)}")
    # Synthetic high-entropy format probe, never a real provider credential.
    (positive / "secret.txt").write_text("github_token = " + "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8")
    if not any(item["RuleID"] == "github-pat" for item in leaks(binary, positive, temp / "secret.json")):
        raise RuntimeError("Secret positive control was not detected")
    invalid = temp / "invalid.yml"
    invalid.write_text("rules: [not-a-rule]")
    try:
        semgrep(positive, temp / "invalid.json", config=invalid)
    except RuntimeError:
        pass
    else:
        raise RuntimeError("Invalid scanner configuration did not fail closed")
    try:
        read_report(temp / "missing.json")
    except RuntimeError:
        pass
    else:
        raise RuntimeError("Missing scanner output did not fail closed")
    clean = temp / "clean"
    clean.mkdir()
    (clean / "safe.ts").write_text("export const safe = 1;")
    if semgrep(clean, temp / "clean.json")["results"] or leaks(binary, clean, temp / "clean-secrets.json"):
        raise RuntimeError("Removing positive controls did not restore a clean scan")


def main():
    os.chdir(ROOT)
    binary = os.environ.get("GITLEAKS_BIN", "gitleaks")
    if run(["semgrep", "--version"]).stdout.strip() != SEMGREP_VERSION:
        raise RuntimeError("Unexpected Semgrep version")
    if run([binary, "version"]).stdout.strip().lstrip("v") != GITLEAKS_VERSION:
        raise RuntimeError("Unexpected Gitleaks version")
    if not RULES.is_file():
        raise RuntimeError("Missing pinned SAST rules")
    paths = run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]).stdout.split("\0")
    output = ROOT / ".local-preview/security"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="action-inbox-security-") as directory:
        temp = Path(directory)
        controls(binary, temp)
        candidate = temp / "candidate"
        source = temp / "application"
        candidate.mkdir()
        source.mkdir()
        source_count = 0
        for name in sorted(set(paths) - {""}):
            path = ROOT / name
            if not path.is_file():
                continue  # A deleted tracked file is absent from the candidate.
            destination = candidate / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
            if name.startswith(("apps/", "services/", "packages/")) and path.suffix in (".ts", ".tsx") and not any(part in name for part in (".test.", "/testing/")):
                destination = source / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, destination)
                source_count += 1
        if not source_count:
            raise RuntimeError("No application source selected")
        sast = semgrep(source, output / "semgrep.json")
        if not sast.get("paths", {}).get("scanned"):
            raise RuntimeError("Semgrep scanned no files")
        if sast["results"]:
            raise RuntimeError(f"SAST findings: {json.dumps(sast['results'])}")
        findings = leaks(binary, candidate, output / "gitleaks.json")
        dispositions = read_report(ROOT / "security/dispositions.json")
        for finding in findings:
            path = Path(finding["File"])
            relative = path.relative_to(candidate).as_posix()
            line = path.read_text().splitlines()[finding["StartLine"] - 1]
            reviewed = {
                "file": relative,
                "rule": finding["RuleID"],
                "lineSha256": hashlib.sha256(line.encode()).hexdigest(),
            }
            if (date.today().isoformat() > dispositions["expires"]
                    or finding["StartLine"] != finding["EndLine"]
                    or reviewed not in dispositions["gitleaks"]):
                raise RuntimeError("Secret scan found candidate exposures; inspect redacted report")
        print(f"SEC-SECRET-01: {len(findings)} exact reviewed public-prose findings")
    audit = run(["npm", "audit", "--package-lock-only", "--ignore-scripts", "--json"], expected=(0, 1))
    data = json.loads(audit.stdout)
    (output / "npm-audit.json").write_text(json.dumps(data, indent=2) + "\n")
    if "error" in data or "vulnerabilities" not in data or data["metadata"]["vulnerabilities"]["total"]:
        raise RuntimeError("Dependency audit failed or reported advisories")
    print(json.dumps({"semgrep": SEMGREP_VERSION, "gitleaks": GITLEAKS_VERSION,
                      "rulesSha256": hashlib.sha256(RULES.read_bytes()).hexdigest(),
                      "applicationFiles": source_count, "positiveControls": "passed",
                      "scannerErrorAndMissingOutput": "fail closed", "findings": 0}))


if __name__ == "__main__":
    main()
