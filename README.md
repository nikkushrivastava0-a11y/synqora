# SYNQORA

## Live hackathon demo

**[Open SYNQORA — live judge dashboard](https://synqora-live-judge.vercel.app/)**

The live dashboard connects to the original local demo through an authenticated temporary relay. It displays saved planning and review results and requires the demo laptop and tunnel to remain online. Live write operations require operator authentication.

**[Latest deployment source](https://github.com/nikkushrivastava0-a11y/synqora/tree/deploy/vercel-demo)**

## Local demo

Windows (Node 24): double-click `start-demo.cmd` and keep its window open. On a clean board, run `backend\mcp\check-gemini-read.cmd` to start the signed-in Codex planner and Google reviewer.
After preserving any live evidence, double-click `reset-demo.cmd` to restore a clean CampusFest seed. See [DEMO.md](DEMO.md) and [BACKUP.md](BACKUP.md) for the presentation.

SYNQORA helps AI agents share plans, track requirement revisions, and flag outdated work for human review. Built by Team Git Happens for NexHack 2.0.
