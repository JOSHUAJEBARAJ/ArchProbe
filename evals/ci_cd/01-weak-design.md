# Weak CI/CD design

Status: prepared; not run against a real model yet.

## Purpose

Check whether the interviewer identifies a concrete delivery risk, asks one relevant follow-up, and limits final feedback to demonstrated evidence.

## Setup

1. Select **Design a CI/CD pipeline** and create a fresh interview.
2. Record the selected model and reasoning effort in the result below.
3. Clarify the scenario facts: one containerized application, one repository, five developers, several merges per day, staging and production, failed tests must block promotion, and a bad release must be recoverable.
4. When asked to propose the pipeline, draw three connected boxes: **Git → CI runner → Production**. Do not draw staging, tests, or a rollback path.

## Candidate answer

Say this answer:

> Every merge to main triggers the CI runner. It builds a Docker image and deploys it directly to production using the latest tag. I would skip tests to make releases faster. If a release breaks, someone can SSH into the server and fix it manually.

Wait for one follow-up, then end the interview without adding more design details. Save the conversation and feedback through the normal app flow.

## What a useful follow-up should do

- Ask one focused question about a demonstrated risk: skipping tests despite the test gate, bypassing staging, mutable image identity, or manual production recovery.
- Ground any diagram claim in the actual three boxes and arrows.
- Give the candidate an opportunity to reason about the risk before offering a solution.

There is no required exact question or preferred CI/cloud vendor. A question about an actual omission or contradiction can pass.

## What final feedback should do

- Describe the proposed direct deployment and distinguish it from an inferred implementation.
- Identify a discussed weakness with a valid supporting answer or diagram reference.
- Mark secrets, database migrations, and other unexplored topics as unassessed rather than demonstrated weaknesses.
- Avoid crediting tests, staging, immutable promotion, or automated rollback that the candidate did not describe.
- Avoid numerical scores and hiring predictions.

Check the meaning of each cited claim as well as whether the reference opens. A working link alone does not establish that the claim is supported.

## Result

| Field | Observation |
| --- | --- |
| Date | Pending |
| Model / reasoning | Pending |
| Saved interview ID | Pending |
| Exact follow-up | Pending |
| Relevant and focused? | Pending |
| Diagram claims supported? | Pending |
| Feedback claims and citations supported? | Pending |
| Unexplored topics handled fairly? | Pending |
| Overall | Not run |

Keep unexpected behavior and the actual response in this record. Do not mark the case passed based only on unit tests or an example of the desired answer.

## Related manual observation — simpler design

Joshua shared this saved answer on 2026-11-06, referenced in feedback as Answer 35:

> So, this is what my designs looks like.
> From the Git repository, we push into the remote environment and which runs the CA runner.
> Once it has been everything, it's been passed, we will deploy into the production.

This differs from the scripted weak answer: it mentions an unspecified success condition and does not explicitly skip tests, use a mutable image tag, or propose manual SSH recovery. It therefore does not complete the original test case.

The interviewer asked:

> You’ve outlined Git → CI runner → production. Since staging is required, how would it fit into that flow, and what must pass there before a release can reach production?

The follow-up targets missing staging and asks for promotion criteria. The shared wrap-up credits a general success gate while acknowledging that checks were undefined, identifies missing staging, and marks unexplored topics unassessed. Those judgments are consistent with the shared answer and the reported three-box flow. The actual diagram and citation ownership were not independently inspected for this observation.

Outcome: relevant follow-up and reasonable text feedback for the simpler design; original weak-design case remains not run. Model, effort, and saved interview ID were not supplied. The transcript's “CA runner” wording also illustrates recognition ambiguity; do not silently treat every technical-term transcription as exact.
