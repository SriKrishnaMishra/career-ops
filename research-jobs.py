#!/usr/bin/env python3
"""Resume-driven JobSpy research bridge.

This script uses JobSpy to discover jobs that match the candidate resume,
then optionally appends new jobs into the existing Career-Ops pipeline.

Usage:
  python3 research-jobs.py
  python3 research-jobs.py --search-term "machine learning engineer" --location India
  python3 research-jobs.py --write-pipeline

Prerequisite:
  pip install -U python-jobspy
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
CV_PATH = ROOT / "cv.md"
PIPELINE_PATH = ROOT / "data" / "pipeline.md"
SCAN_HISTORY_PATH = ROOT / "data" / "scan-history.tsv"
OUTPUT_DIR = ROOT / "data" / "jobspy-research"

DEFAULT_SITES = ["indeed", "linkedin", "google", "zip_recruiter", "glassdoor", "naukri"]
PROFILE_SITES = {
    "focused": ["linkedin", "indeed", "google"],
    "broad": ["linkedin", "indeed", "google", "zip_recruiter", "glassdoor", "bayt", "naukri", "bdjobs"],
}
DEFAULT_COUNTRY = "India"
DEFAULT_LOCATION = "India"
DEFAULT_RESULTS_WANTED = 25
DEFAULT_SOURCES = ["jobspy", "adzuna"]
DEFAULT_ADZUNA_COUNTRY = "in"

ROLE_TERMS: list[tuple[str, list[str]]] = [
    ("machine learning engineer", ["machine learning", "mlops", "pytorch", "tensorflow"]),
    ("ai engineer", ["artificial intelligence", "ai/ml", "ai engineer", "llm", "langchain"]),
    ("applied ai engineer", ["applied ai", "production ai", "conversational ai"]),
    ("nlp engineer", ["nlp", "hugging face", "transformers", "llm", "langchain"]),
    ("computer vision engineer", ["computer vision", "opencv", "face verification"]),
    ("mlops engineer", ["mlops", "docker", "fastapi", "flask", "api integrations"]),
    ("data scientist", ["data science", "mysql", "pandas", "analytics"]),
    ("ai product builder", ["saas", "product", "platform"]),
]

TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+/.-]{1,}", re.I)
DEFAULT_RELEVANCE_TERMS = [
    "ai",
    "ml",
    "machine learning",
    "deep learning",
    "nlp",
    "llm",
    "applied ai",
    "computer vision",
    "mlops",
    "data scientist",
    "data science",
]
NEGATIVE_TITLE_TERMS = [
    "account executive",
    "sales",
    "marketing intern",
    "business development",
    "hr",
    "recruiter",
    "talent acquisition",
    "customer support",
    "inside sales",
    "telecaller",
]


@dataclass(frozen=True)
class JobHit:
    title: str
    company: str
    url: str
    site: str
    location: str = ""
    date_posted: str = ""


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def read_resume_text() -> str:
    if not CV_PATH.exists():
        return ""
    return CV_PATH.read_text(encoding="utf-8", errors="ignore")


def derive_search_terms(resume_text: str, user_term: str | None = None) -> list[str]:
    if user_term:
        return [user_term.strip()]

    haystack = normalize_text(resume_text)
    terms: list[str] = []

    for term, markers in ROLE_TERMS:
        if any(marker in haystack for marker in markers):
            terms.append(term)

    if not terms:
        terms = ["machine learning engineer", "ai engineer"]

    # Prefer the strongest match order for a resume-driven search.
    preferred_order = [
        "machine learning engineer",
        "ai engineer",
        "applied ai engineer",
        "nlp engineer",
        "computer vision engineer",
        "mlops engineer",
        "data scientist",
        "ai product builder",
    ]
    ordered = [term for term in preferred_order if term in terms]
    return ordered[:4] or terms[:4]


def build_site_list(raw_sites: str | None) -> list[str]:
    if not raw_sites:
        return DEFAULT_SITES
    sites = [site.strip() for site in raw_sites.split(",") if site.strip()]
    return sites or DEFAULT_SITES


def build_site_list_for_profile(profile: str, raw_sites: str | None) -> list[str]:
    if raw_sites:
      return build_site_list(raw_sites)
    return PROFILE_SITES.get(profile, DEFAULT_SITES)


def build_source_list(raw_sources: str | None) -> list[str]:
    if not raw_sources:
        return DEFAULT_SOURCES
    sources = [source.strip().lower() for source in raw_sources.split(",") if source.strip()]
    return sources or DEFAULT_SOURCES


def normalize_tokens(text: str) -> list[str]:
    return [token.group(0).lower() for token in TOKEN_RE.finditer(text or "")]


def is_relevant_title(title: str, search_terms: list[str], strict: bool) -> bool:
    if not strict:
        return True

    t = normalize_text(title)
    if not t:
        return False

    dynamic_terms = [normalize_text(term) for term in search_terms if term]
    for term in dynamic_terms:
        if term and term in t:
            return True

    title_tokens = set(normalize_tokens(t))
    if not title_tokens:
        return False

    for phrase in DEFAULT_RELEVANCE_TERMS:
        normalized_phrase = normalize_text(phrase)
        if normalized_phrase in t:
            return True
        phrase_tokens = [token for token in normalize_tokens(normalized_phrase) if len(token) >= 2]
        if phrase_tokens and all(token in title_tokens for token in phrase_tokens):
            return True

    return False


def title_relevance_score(title: str, search_terms: list[str]) -> int:
    t = normalize_text(title)
    if not t:
        return 0

    score = 0
    for term in search_terms:
        normalized = normalize_text(term)
        if normalized and normalized in t:
            score += 7

    for phrase in DEFAULT_RELEVANCE_TERMS:
        p = normalize_text(phrase)
        if p and p in t:
            score += 3

    if re.search(r"\b(ai|ml|nlp|llm|machine learning|deep learning|computer vision|mlops)\b", t):
        score += 4

    if re.search(r"\b(intern|internship|associate|entry|junior|engineer|scientist|applied)\b", t):
        score += 2

    for neg in NEGATIVE_TITLE_TERMS:
        if neg in t:
            score -= 8

    return score


def dedupe_and_rank_jobs(jobs: list[JobHit], search_terms: list[str], results_wanted: int) -> list[JobHit]:
    ranked: list[tuple[int, JobHit]] = []
    seen_keys: set[str] = set()

    for job in jobs:
        key = f"{normalize_text(job.company)}|{normalize_text(job.title)}|{normalize_text(job.site)}"
        if key in seen_keys:
            continue
        seen_keys.add(key)

        score = title_relevance_score(job.title, search_terms)
        if score <= 0:
            continue
        ranked.append((score, job))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [job for _, job in ranked[:results_wanted]]


def load_seen_urls() -> set[str]:
    seen: set[str] = set()
    if SCAN_HISTORY_PATH.exists():
        lines = SCAN_HISTORY_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
        for line in lines[1:]:
            parts = line.split("\t")
            if parts and parts[0]:
                seen.add(parts[0])

    if PIPELINE_PATH.exists():
        text = PIPELINE_PATH.read_text(encoding="utf-8", errors="ignore")
        for match in re.finditer(r"- \[[ x]\] (https?://\S+)", text):
            seen.add(match.group(1))

    return seen


def append_pipeline(jobs: list[JobHit]) -> None:
    if not jobs:
        return

    if not PIPELINE_PATH.exists():
        PIPELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        PIPELINE_PATH.write_text("# Pipeline\n\n## Pendientes\n\n", encoding="utf-8")

    text = PIPELINE_PATH.read_text(encoding="utf-8", errors="ignore")
    marker = "## Pendientes"
    idx = text.find(marker)
    if idx == -1:
        insert_at = text.find("## Procesadas")
        if insert_at == -1:
            insert_at = len(text)
        block = "\n" + marker + "\n\n" + "\n".join(
            f"- [ ] {job.url} | {job.company} | {job.title}" for job in jobs
        ) + "\n\n"
        text = text[:insert_at] + block + text[insert_at:]
    else:
        after_marker = idx + len(marker)
        next_section = text.find("\n## ", after_marker)
        insert_at = len(text) if next_section == -1 else next_section
        block = "\n" + "\n".join(
            f"- [ ] {job.url} | {job.company} | {job.title}" for job in jobs
        ) + "\n"
        text = text[:insert_at] + block + text[insert_at:]

    PIPELINE_PATH.write_text(text, encoding="utf-8")


def append_scan_history(jobs: list[JobHit], query_name: str) -> None:
    if not jobs:
        return

    SCAN_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not SCAN_HISTORY_PATH.exists():
        SCAN_HISTORY_PATH.write_text(
            "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n",
            encoding="utf-8",
        )

    today = date.today().isoformat()
    lines = [
        f"{job.url}\t{today}\t{job.site or query_name}\t{job.title}\t{job.company}\tadded_research"
        for job in jobs
    ]
    with SCAN_HISTORY_PATH.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def import_jobspy():
    try:
        from jobspy import scrape_jobs  # type: ignore
    except Exception as exc:  # pragma: no cover - import error path is user-facing
        raise RuntimeError(
            "JobSpy is not installed. Run: pip install -U python-jobspy"
        ) from exc
    return scrape_jobs


def fetch_adzuna(
    search_term: str,
    location: str,
    country: str,
    results_wanted: int,
) -> list[JobHit]:
    app_id = os.getenv("ADZUNA_APP_ID", "").strip()
    app_key = os.getenv("ADZUNA_APP_KEY", "").strip()
    if not app_id or not app_key:
        return []

    page_size = min(50, max(10, results_wanted))
    params = urlencode(
        {
            "app_id": app_id,
            "app_key": app_key,
            "results_per_page": page_size,
            "what": search_term,
            "where": location,
            "content-type": "application/json",
        }
    )
    url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1?{params}"

    try:
        with urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"[Adzuna] {search_term}: {exc}", file=sys.stderr)
        return []

    hits: list[JobHit] = []
    for row in payload.get("results", []):
        title = str(row.get("title") or "").strip()
        company = str((row.get("company") or {}).get("display_name") or "").strip()
        url = str(row.get("redirect_url") or "").strip()
        location_value = str((row.get("location") or {}).get("display_name") or "").strip()
        date_posted = str(row.get("created") or "").strip()
        if not title or not company or not url:
            continue
        hits.append(
            JobHit(
                title=title,
                company=company,
                url=url,
                site="adzuna",
                location=location_value,
                date_posted=date_posted,
            )
        )

    return hits[:results_wanted]


def search_jobs(
    search_terms: Iterable[str],
    sites: list[str],
    sources: list[str],
    location: str,
    country_indeed: str,
    country_adzuna: str,
    results_wanted: int,
    hours_old: int | None,
    is_remote: bool,
    strict_relevance: bool,
) -> list[JobHit]:
    scrape_jobs = import_jobspy()
    seen_urls = load_seen_urls()
    all_hits: list[JobHit] = []
    seen_in_run: set[str] = set()

    search_terms = list(search_terms)
    per_query = max(10, results_wanted // max(1, len(search_terms)))

    for term in search_terms:
        if "jobspy" in sources:
            try:
                frame = scrape_jobs(
                    site_name=sites,
                    search_term=term,
                    location=location,
                    results_wanted=per_query,
                    country_indeed=country_indeed,
                    hours_old=hours_old,
                    is_remote=is_remote,
                    verbose=0,
                )
            except Exception as exc:
                print(f"[JobSpy] {term}: {exc}", file=sys.stderr)
            else:
                try:
                    records = frame.to_dict(orient="records")
                except Exception:
                    records = []

                for row in records:
                    url = str(row.get("job_url") or row.get("job_url_direct") or "").strip()
                    title = str(row.get("title") or "").strip()
                    company = str(row.get("company") or row.get("company_name") or "").strip()
                    site = str(row.get("site") or row.get("source") or "jobspy").strip()
                    location_value = str(row.get("location") or "").strip()
                    date_posted = str(row.get("date_posted") or row.get("date") or "").strip()

                    if not url or not title or not company:
                        continue
                    if not is_relevant_title(title, search_terms, strict_relevance):
                        continue
                    if url in seen_urls or url in seen_in_run:
                        continue

                    seen_in_run.add(url)
                    all_hits.append(
                        JobHit(
                            title=title,
                            company=company,
                            url=url,
                            site=site,
                            location=location_value,
                            date_posted=date_posted,
                        )
                    )

        if "adzuna" in sources:
            for hit in fetch_adzuna(term, location, country_adzuna, per_query):
                if not is_relevant_title(hit.title, search_terms, strict_relevance):
                    continue
                if hit.url in seen_urls or hit.url in seen_in_run:
                    continue
                seen_in_run.add(hit.url)
                all_hits.append(hit)

    return dedupe_and_rank_jobs(all_hits, search_terms, results_wanted)


def run_adaptive_search(
    search_terms: list[str],
    sites: list[str],
    sources: list[str],
    location: str,
    country_indeed: str,
    country_adzuna: str,
    results_wanted: int,
    hours_old: int | None,
    is_remote: bool,
    strict_relevance: bool,
    profile: str,
    user_term: str | None,
) -> tuple[list[JobHit], str]:
    jobs = search_jobs(
        search_terms=search_terms,
        sites=sites,
        sources=sources,
        location=location,
        country_indeed=country_indeed,
        country_adzuna=country_adzuna,
        results_wanted=results_wanted,
        hours_old=hours_old,
        is_remote=is_remote,
        strict_relevance=strict_relevance,
    )
    if jobs:
        return jobs, "primary"

    if strict_relevance:
        print("[JobSpy] no new jobs in strict mode, retrying with relaxed relevance...", file=sys.stderr)
        jobs = search_jobs(
            search_terms=search_terms,
            sites=sites,
            sources=sources,
            location=location,
            country_indeed=country_indeed,
            country_adzuna=country_adzuna,
            results_wanted=max(results_wanted, 30),
            hours_old=max(hours_old or 0, 336) if hours_old is not None else None,
            is_remote=is_remote,
            strict_relevance=False,
        )
        if jobs:
            return jobs, "relaxed-relevance"

    if profile == "focused" and not user_term:
        print("[JobSpy] still no new jobs, retrying with broad profile...", file=sys.stderr)
        broad_sites = PROFILE_SITES.get("broad", DEFAULT_SITES)
        jobs = search_jobs(
            search_terms=search_terms,
            sites=broad_sites,
            sources=sources,
            location=location,
            country_indeed=country_indeed,
            country_adzuna=country_adzuna,
            results_wanted=max(results_wanted, 35),
            hours_old=max(hours_old or 0, 720) if hours_old is not None else None,
            is_remote=is_remote,
            strict_relevance=False,
        )
        if jobs:
            return jobs, "broad-fallback"

    return jobs, "none"


def main() -> int:
    parser = argparse.ArgumentParser(description="Resume-driven job research with JobSpy")
    parser.add_argument("--search-term", dest="search_term", default=None)
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--country", default=DEFAULT_COUNTRY)
    parser.add_argument("--results-wanted", type=int, default=DEFAULT_RESULTS_WANTED)
    parser.add_argument("--hours-old", type=int, default=72)
    parser.add_argument("--sites", default=None)
    parser.add_argument("--profile", default=os.getenv("CAREER_OPS_JOB_PROFILE", "broad"))
    parser.add_argument("--sources", default=",".join(DEFAULT_SOURCES))
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--strict-relevance", action="store_true")
    parser.add_argument("--write-pipeline", action="store_true")
    parser.add_argument("--output", default=str(OUTPUT_DIR / f"{date.today().isoformat()}.json"))
    parser.add_argument("--adzuna-country", default=os.getenv("ADZUNA_COUNTRY", DEFAULT_ADZUNA_COUNTRY))
    args = parser.parse_args()

    resume_text = read_resume_text()
    search_terms = derive_search_terms(resume_text, args.search_term)
    sites = build_site_list_for_profile(args.profile, args.sites)
    sources = build_source_list(args.sources)

    print(f"[JobSpy] search terms: {', '.join(search_terms)}")
    print(f"[JobSpy] profile: {args.profile}")
    print(f"[JobSpy] sites: {', '.join(sites)}")
    print(f"[JobSpy] sources: {', '.join(sources)}")
    print(f"[JobSpy] location: {args.location} | country: {args.country}")

    jobs, strategy = run_adaptive_search(
        search_terms=search_terms,
        sites=sites,
        sources=sources,
        location=args.location,
        country_indeed=args.country,
        country_adzuna=args.adzuna_country,
        results_wanted=args.results_wanted,
        hours_old=args.hours_old,
        is_remote=args.remote,
        strict_relevance=args.strict_relevance,
        profile=args.profile,
        user_term=args.search_term,
    )
    print(f"[JobSpy] strategy: {strategy}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.output)
    out_path.write_text(
        json.dumps([job.__dict__ for job in jobs], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    if args.write_pipeline and jobs:
        append_pipeline(jobs)
        append_scan_history(jobs, "JobSpy")

    print(f"[JobSpy] new jobs: {len(jobs)}")
    for job in jobs[:20]:
        print(f"  + {job.company} | {job.title} | {job.url}")

    if jobs:
        print(f"[JobSpy] saved: {out_path}")
        if args.write_pipeline:
            print("[JobSpy] appended results to pipeline and scan history")
        else:
            print("[JobSpy] add --write-pipeline to feed results into pipeline.md")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
