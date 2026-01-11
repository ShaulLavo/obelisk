# GitIngest – AI Agent Quick Reference

Convert any Git repository into AI-ready text for programmatic analysis.

## Installation

```bash
# CLI (recommended for scripts)
pipx install gitingest

# Python package (for code integration)
pip install gitingest
```

## Quick Start

| Method | Use Case | Example |
|--------|----------|---------|
| **CLI** | Scripts & automation | `gitingest https://github.com/user/repo -o -` |
| **Python** | Code integration | `from gitingest import ingest; s,t,c = ingest('repo-url')` |

## Output Format

GitIngest returns three sections:

1. **Summary**: Repository metadata, file count, token estimate
2. **Tree**: Hierarchical directory structure
3. **Content**: File contents with clear delimiters

```python
from gitingest import ingest

summary, tree, content = ingest("https://github.com/user/repo")
full_context = f"{summary}\n\n{tree}\n\n{content}"
```

## Common Patterns

```bash
# Filter by file type
gitingest https://github.com/user/repo -i "*.py" -i "*.js" -o -

# Exclude dependencies
gitingest https://github.com/user/repo -e "node_modules/*" -e "*.log" -o -

# Limit file size (bytes)
gitingest https://github.com/user/repo -s 51200 -o -

# Private repos
export GITHUB_TOKEN="ghp_token"
gitingest https://github.com/user/private-repo -t $GITHUB_TOKEN -o -

# Specific branch
gitingest https://github.com/user/repo -b main -o -
```

## Python Integration

```python
from gitingest import ingest, ingest_async

# Synchronous
summary, tree, content = ingest(
    "https://github.com/user/repo",
    include_patterns=["*.py", "*.js"],
    exclude_patterns=["node_modules/*", "*.log"],
    max_file_size=51200
)

# Asynchronous (for multiple repos)
async def batch_process(repos):
    tasks = [ingest_async(url) for url in repos]
    return await asyncio.gather(*tasks)
```

## Key Flags

- `-i` / `--include-pattern`: Include files matching pattern
- `-e` / `--exclude-pattern`: Exclude files matching pattern
- `-s` / `--max-size`: Max file size in bytes
- `-b` / `--branch`: Specific branch
- `-t` / `--token`: GitHub token for private repos
- `-o` / `--output`: Output file (use `-` for stdout)

## Resources

- Web UI: https://gitingest.com (human use only)
- GitHub: https://github.com/coderamp-labs/gitingest
- PyPI: https://pypi.org/project/gitingest/
