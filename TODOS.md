# TODOS

## P1 - Next Up

### Jira/Linear API Integration
**What:** One-click push from Tranzmit ticket to Jira/Linear via OAuth API.
**Why:** Clipboard copy works but adds friction. One-click push makes Tranzmit a real workflow tool.
**Context:** Ticket model stores all needed data (title, description, severity, evidence, quotes). This is the last-mile integration: OAuth connection in Settings, default project/board selection, issue creation via Jira Cloud REST API + Linear GraphQL API.
**Effort:** L (human) / M (CC+gstack: ~45min)
**Depends on:** Ticket model (unified ticket system plan)
**Added:** 2026-03-18

## P2 - Follow-Up

### Slack Weekly Digest
**What:** Monday 9am cron pushes top 3 tickets to a configured Slack channel via incoming webhook.
**Why:** Teams don't check dashboards daily. Bringing insights to Slack keeps Tranzmit top-of-mind.
**Context:** Ticket model provides the data. Needs: Slack webhook URL in Settings, cron job, formatted message with ticket title/score/churn impact + link back to dashboard.
**Effort:** S (human) / S (CC+gstack: ~15min)
**Depends on:** Ticket model
**Added:** 2026-03-18

### Team Routing + Ticket Lifecycle
**What:** Category-to-team routing rules (UX Friction -> Design, Bug -> Eng) + ticket states (open -> assigned -> resolved -> verified).
**Why:** Makes tickets actionable by specific teams. Lifecycle tracking enables measuring fix velocity.
**Context:** Categories already exist on tickets from LLM classification. Team mapping is a Settings UI + filter. Lifecycle adds status field to Ticket model. Most valuable when paired with Jira integration.
**Effort:** M (human) / S (CC+gstack: ~20min)
**Depends on:** Jira/Linear integration (P1 above)
**Added:** 2026-03-18

## P3 - Future

### Impact Measurement (Fix Verification)
**What:** When a ticket is resolved, monitor underlying signals for 7 days. If churn scores improve and friction stops appearing, show "Verified fixed" with impact data.
**Why:** Closes the loop: problem detected -> fix shipped -> impact measured. Proves Tranzmit ROI ("you fixed 3 tickets and churn dropped 12%").
**Context:** DailyChurnScore already tracks per-user risk over time. Needs before/after comparison per ticket. Requires ticket lifecycle (P2) + time-series churn data.
**Effort:** L (human) / M (CC+gstack: ~30min)
**Depends on:** Team Routing + Ticket Lifecycle (P2 above)
**Added:** 2026-03-18
