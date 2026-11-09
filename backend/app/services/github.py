"""Read-only import from a public GitHub repository (the one real external integration)."""
from __future__ import annotations

import re
from typing import Any

import httpx

API = "https://api.github.com"
REPO_RX = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class GitHubError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def parse_repo(value: str) -> str:
    v = value.strip().removeprefix("https://github.com/").removeprefix("http://github.com/").strip("/")
    v = re.sub(r"\.git$", "", v)
    parts = v.split("/")
    v = "/".join(parts[:2])
    if not REPO_RX.match(v):
        raise GitHubError("Enter a repository as owner/name, for example octocat/Hello-World.", 422)
    return v


def _get(client: httpx.Client, url: str, params: dict[str, Any] | None = None, raw: bool = False):
    headers = {"Accept": "application/vnd.github.raw+json" if raw else "application/vnd.github+json"}
    r = client.get(url, params=params, headers=headers)
    if r.status_code == 404:
        raise GitHubError("Repository not found, or it is private. Only public repositories are supported.", 422)
    if r.status_code in (403, 429):
        raise GitHubError("GitHub rate limit reached. Try again later or set GITHUB_TOKEN on the server.", 429)
    if r.status_code >= 400:
        raise GitHubError(f"GitHub returned an error ({r.status_code}).", 502)
    return r.text if raw else r.json()


def fetch_repo(repo: str, max_items: int = 15, token: str = "") -> list[dict[str, Any]]:
    """Returns segments: [{loc, text, author, date}]. Each PR, issue and comment is one segment."""
    headers = {"User-Agent": "NextOwner-handover"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    segs: list[dict[str, Any]] = []
    try:
        with httpx.Client(timeout=20, headers=headers) as c:
            _get(c, f"{API}/repos/{repo}")  # existence and visibility check
            try:
                readme = _get(c, f"{API}/repos/{repo}/readme", raw=True)
                for i, line in enumerate(readme.splitlines()[:200], start=1):
                    if line.strip():
                        segs.append({"loc": f"README line {i}", "text": line.strip(), "author": None, "date": None})
            except GitHubError:
                pass
            prs = _get(c, f"{API}/repos/{repo}/pulls", {"state": "all", "per_page": max_items, "sort": "updated", "direction": "desc"})
            for pr in prs:
                n = pr["number"]
                who = (pr.get("user") or {}).get("login")
                day = (pr.get("created_at") or "")[:10] or None
                segs.append({"loc": f"PR #{n}", "text": f"PR #{n}: {pr['title']}. {_clean(pr.get('body'))}", "author": who, "date": day})
                try:
                    for cm in _get(c, f"{API}/repos/{repo}/pulls/{n}/comments", {"per_page": 10})[:10]:
                        segs.append({
                            "loc": f"PR #{n} review comment", "text": _clean(cm.get("body")),
                            "author": (cm.get("user") or {}).get("login"), "date": (cm.get("created_at") or "")[:10] or None,
                        })
                except GitHubError:
                    pass
            issues = _get(c, f"{API}/repos/{repo}/issues", {"state": "all", "per_page": max_items, "sort": "updated", "direction": "desc"})
            for it in issues:
                if "pull_request" in it:
                    continue
                n = it["number"]
                segs.append({
                    "loc": f"Issue #{n}", "text": f"Issue #{n}: {it['title']}. {_clean(it.get('body'))}",
                    "author": (it.get("user") or {}).get("login"), "date": (it.get("created_at") or "")[:10] or None,
                })
    except httpx.HTTPError as exc:
        raise GitHubError("Could not reach GitHub from the server. Check its network access.", 502) from exc
    segs = [s for s in segs if s["text"].strip()]
    if not segs:
        raise GitHubError("The repository has no readable README, pull requests or issues.", 422)
    return segs


def _clean(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    return re.sub(r"[ \t]+", " ", text).strip()[:3000]
