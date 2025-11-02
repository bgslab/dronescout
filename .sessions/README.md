# DroneScout Session Archive

This directory contains summaries of all Claude Code sessions for the DroneScout project.

## 📁 Directory Structure

```
.sessions/
├── README.md                    # This file
├── SESSION_V1-V7_SUMMARY.md    # Sessions 1-7 (gray map debugging)
├── SESSION_V8_SUMMARY.md        # Session 8 (telemetry + inline maps)
├── SESSION_V9_SUMMARY.md        # Session 9 (next session)
└── CONTEXT.md                   # Always-up-to-date project context
```

## 🚀 How to Use

### Starting a New Session

1. Open Claude Code in the DroneScout directory
2. Upload the **CONTEXT.md** file at the start of your session
3. Claude will have full project context immediately

### Ending a Session

1. Ask Claude to create a session summary
2. Save it as `SESSION_VX_SUMMARY.md` in this directory
3. Ask Claude to update `CONTEXT.md` with latest changes

## 📝 Session Index

| Version | Date | Focus | Summary File |
|---------|------|-------|--------------|
| V1-V7 | Oct-Nov 2025 | Gray map tiles debugging | `SESSION_V1-V7_SUMMARY.md` |
| V8.0 | Nov 2, 2025 | Telemetry + Inline Maps | `SESSION_V8_SUMMARY.md` |
| V9.0 | TBD | Next features | `SESSION_V9_SUMMARY.md` |

## 🎯 Quick Start Template

Copy this to start each new session:

```
Hi! I'm continuing work on DroneScout. Please read .sessions/CONTEXT.md
for full project context. Here's what I want to work on today:

[Your task here]
```

## 📚 What's in Each File

### CONTEXT.md (Start here!)
- Project overview
- Current architecture
- Key files and their purposes
- Recent changes
- Known issues
- Next priorities

### SESSION_VX_SUMMARY.md
- Detailed session recap
- All commits made
- Technical decisions
- Code snippets
- Bugs fixed
- Features added

## 🔍 Finding Past Work

Use git tags to find specific versions:
```bash
git tag                    # List all versions
git show v8.0             # See V8.0 details
git log --oneline v7.0..v8.0  # See commits between versions
```

## 📦 Backup Strategy

All session files are committed to git, so they're:
- ✅ Version controlled
- ✅ Backed up on GitHub
- ✅ Accessible from anywhere
- ✅ Searchable with git grep

## 💡 Pro Tips

1. **Keep CONTEXT.md updated** - This is your "project memory"
2. **One summary per major version** - Don't create too many files
3. **Use git tags** - Tag every major milestone
4. **Reference line numbers** - Makes it easy to find code later
5. **Include code snippets** - Future sessions can copy/paste

---

*Last Updated: November 2, 2025*
*Current Version: V8.0*
