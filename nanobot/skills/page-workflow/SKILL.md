---
name: page-workflow
description: Record a multi-step browser workflow and save it as a reusable automation skill. Use when the user asks to automate a task, record a process, or create a repeatable sequence of actions across web pages.
metadata: {"nanobot":{"emoji":"⚡","requires":{"env":["DISPLAY"]}}}
---

# Page Workflow

Record a multi-step browser task and save it as a reusable automation skill.

Works best with page-mapper skills — use existing `page-*` selectors instead of discovering them each time.

## Workflow

### 1. Identify the task

Clarify with the user:
- What is the end goal? (e.g., "create a Jira bug ticket")
- What inputs vary each time? (e.g., title, severity, assignee)
- What is the starting point? (e.g., Jira board page)

### 2. Check for existing page maps

Look for `site-*` or `page-*` skills that cover the pages involved. If they exist, load them for selectors. If not, use page-mapper to create them first.

### 3. Execute and record

Perform the task step by step using the `browser` tool. For each step, note:
- The action (navigate, click, fill, wait, verify)
- The selector or URL used
- Any dynamic input (mark as `<parameter>`)

Example recording:

```
1. browser(url="https://jira.company.com/board", code="document.title")
2. browser(code="document.querySelector('button#create-issue').click()")
3. browser(code="await new Promise(r => setTimeout(r, 500))")  // wait for modal
4. browser(code="document.querySelector('#summary').value = '<title>'")
5. browser(code="const s = document.querySelector('#severity'); s.value = '<severity>'; s.dispatchEvent(new Event('change', {bubbles: true}))")
6. browser(code="document.querySelector('#assignee').value = '<assignee>'")
7. browser(code="document.querySelector('button[type=\"submit\"]').click()")
8. browser(code="document.querySelector('.success-message')?.textContent")  // verify
```

### 4. Test the sequence

Re-run the recorded steps with real inputs to verify they work end-to-end. Fix any:
- Missing waits (element not yet in DOM)
- Stale selectors (page changed since mapping)
- SPA state issues (React/Vue not reacting to `.value` — use `dispatchEvent`)

### 5. Save as a task skill

**skill_name**: `task-<site>-<action>` (e.g., `task-jira-create-bug`)

**Template**:

```markdown
# <Task Name>

<One-line description of what this automates.>

Requires: page-<site>-<page> (link to page map skill)

## Parameters
- `<param1>`: <description>
- `<param2>`: <description>

## Steps

### 1. Navigate to <starting page>
browser(url="<url>", code="document.title")

### 2. <Action description>
browser(code="<js with <param> placeholders>")

### 3. <Action description>
browser(code="<js>")

### 4. Verify
browser(code="<js that confirms success>")

## Error Handling
- If <selector> not found: <what to do>
- If page redirects: <what to do>
```

## Tips

- Mark variable inputs as `<param>` in the recorded steps — the agent substitutes real values at runtime.
- Add waits after clicks that trigger navigation or modals. Use element presence checks over fixed timeouts:
  `new Promise(r => { const c = () => document.querySelector('.modal') ? r('ready') : setTimeout(c, 200); c(); })`
- For SPAs, always dispatch events after setting values:
  `el.value = 'x'; el.dispatchEvent(new Event('input', {bubbles: true}))`
- Keep workflows short. If a task has 15+ steps, break it into sub-tasks.
- Reference `page-*` skills for selectors instead of hardcoding — if selectors change, only the page skill needs updating.
