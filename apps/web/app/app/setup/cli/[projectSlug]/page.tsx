import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getSiteUrl } from '@/lib/site-url'
import { Callout, ListCard, PageHead } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'
import { listOwnCliTokens } from './actions'
import { CliTokensManager } from './cli-tokens-manager'

// Setup › CLI — where `gf login` gets its token.
//
// ── Why this is not a section of Setup › Keys ─────────────────────────────────────────────────
// Keys' lede is "Everything that gives something else access to **this project**", and its
// completeness claim is the whole point of that page. A CLI token gives access to an ACCOUNT — every
// project its holder is a member of — so listing it there would make that sentence false on the one
// page whose entire job is an accurate access inventory. That page instead NAMES this one, in
// `CREDENTIAL_KINDS_NOT_LISTED`, which is how it already handles connector URLs and share links.
//
// ── The gate: MEMBER, and the credential is the SESSION'S, not the project's ──────────────────
// `requireProjectMembership` is here because this page renders inside `ProductShell`, which needs a
// project for its nav — the same reason every other Setup page takes a `projectSlug`. It is NOT the
// authorization for minting: the actions resolve the account from the session and never take a user
// id, so a member of any project can mint a token for themselves and for nobody else.
//
// Not owner-gated, deliberately, and this is the one place in Setup where that is right. Minting an
// ingest key is an act against a tenant; minting a CLI token is an act against your own session. An
// owner-only CLI would mean an ordinary member — who can already read every one of these screens in
// a browser — is barred from reading the same things in a terminal, which is a distinction the
// product cannot defend.
export const dynamic = 'force-dynamic'

export default async function SetupCliPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireProjectMembership(projectSlug)

  // Throws rather than returning [] on a query failure (lib/cli-tokens.ts): an empty list renders as
  // "no tokens", which during an outage invites minting a duplicate — or concluding that a token
  // someone is trying to kill is already gone.
  const tokens = await listOwnCliTokens()

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'setup/cli'}>
      <main>
        <PageHead
          title="CLI access"
          lede={
            <>
              A token signs <code>gf</code> in as <strong>you</strong>. It reaches every project you are a
              member of — not just the one in the switcher above — and it can do exactly what you can do
              here, no more.
            </>
          }
        />

        <ListCard plain>
          <Callout tone="info">
            <b>Install and sign in.</b> On any machine with Node 20 or newer:
            <br />
            {/* ⚠️ **`--api` is part of the printed command, and leaving it out was a real defect**
                (fresh reviewer, PR #149). The CLI's own default is `https://goldenfrijoles.com`, so
                on a preview deployment the bare command sent a preview-minted token to PRODUCTION
                and got "not accepted" — a mismatch whose cause is invisible from the terminal.
                Printing the URL beside a command that ignores it is not the same as printing a
                command that uses it.

                The URL comes from `getSiteUrl()`, never from the request's Host header (AGENTS
                rule #5), and on a preview that correctly resolves to the preview's own hostname —
                which is exactly the deployment these tokens address. */}
            <code>npx @golden-frijoles/cli login --api {getSiteUrl()}</code>
            <br />
            <span className="ds-hint">
              Paste a token below when it asks. For CI, set <code>GOLDEN_FRIJOLES_TOKEN</code> and{' '}
              <code>GOLDEN_FRIJOLES_URL</code> instead and skip the login step entirely.
            </span>
          </Callout>

          <CliTokensManager slug={projectSlug} tokens={tokens} />
        </ListCard>
      </main>
    </ProductShell>
  )
}
