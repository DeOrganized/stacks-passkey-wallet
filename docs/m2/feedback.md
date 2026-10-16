# Structured user feedback

This milestone included collecting structured feedback from at least five users. This page summarizes it.

## How it was collected

Feedback came from a structured survey built into a guided onboarding flow on deorganized.com. The flow walks a member through creating a passkey account and using the wallet: verifying an email, claiming small amounts of STX, saving the recovery phrase, setting up a profile, engaging with a community, and sending STX. Every respondent answered the same questions: a 1–5 rating for each step, an optional note on anything confusing at that step, and three open questions (what they wish it did, how they would describe it, anything else).

- **Respondents:** 8 members, each with an account created through the live passkey flow (test and internal accounts excluded).
- **Period:** 2026-09-28 to 2026-10-10.
- **Incentives, stated plainly:** participants were invited individually. During the walkthrough they received small amounts of STX and of a dollar stablecoin (USDCx), returned part of the STX in its send step, and earned DAPs for completion (DeOrganized's participation signal; not money and not transferable). Rewards were for completing the steps; answers were never rewarded, and what a member wrote had no effect on what they received.
- Individual answers are kept private, as the survey promised respondents. The figures below are aggregates.

## Step ratings (1–5, 8 respondents)

| Step | Average | Lowest | Rated 5 |
|---|---|---|---|
| 1. Open the link | 4.75 | 4 | 6 of 8 |
| 2. Create or sign in to your account | 4.75 | 3 | 7 of 8 |
| 3. Add and verify your email | 4.63 | 2 | 7 of 8 |
| 4. Claim your first STX | 5.00 | 5 | 8 of 8 |
| 5. Save your recovery phrase | 4.50 | 3 | 5 of 8 |
| 6. Add a profile picture | 5.00 | 5 | 8 of 8 |
| 7. Join, follow, like and post | 4.75 | 3 | 7 of 8 |
| 8. Claim more STX | 5.00 | 5 | 8 of 8 |
| 9. Send STX | 4.88 | 4 | 7 of 8 |

Every step averaged 4.5 or higher. The lowest-rated step, saving the recovery phrase, is also the step where we deliberately add friction: it asks the member to write the phrase on paper and explains why.

## What members told us (themes)

- **The explorer.** After the send step, a member could open the transaction in the explorer but wasn't sure what they were looking at.
- **All steps at once.** Seeing every step from the start felt overwhelming; step-by-step reveal was suggested.
- **Wishes:** links to digestible learning resources about STX and Bitcoin; sending NFTs; more help on mobile.
- **How members described it:** as an easy way to bring someone new to crypto in a few clicks, as a clever use of passkeys for an in-app wallet, and as the foundation for a larger community network.

## What we are doing with it

- **Shipped since:** member Send for STX and tokens, and moving funds from a connected wallet into the passkey account (2026-10-12). Sending any token a member holds, from a searchable picker, followed on 2026-10-14.
- **Queued, from this feedback:** step-by-step reveal on the onboarding page; more help on mobile; a plain-language explanation of what the explorer shows; links to short learning resources. NFT sending is planned.
- **Queued, from our own testing and field reports:** clearer waiting states after a claim; a plain-language explanation of the recovery phrase; more context on the engagement step; the open iPhone sign-up item in [hardening.md](hardening.md).
