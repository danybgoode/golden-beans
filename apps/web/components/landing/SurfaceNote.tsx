// landing-redesign-v2 · Sprint 2 — the label above every framed surface on the page.
//
// This is the smallest component in the epic and one of the load-bearing ones (epic D4). The page
// renders three different kinds of frame that look alike on purpose — an illustrated conversation
// in the reader's own agent, a real agent window reading live demo-tenant data, and the Golden
// Beans product UI itself — because the frame device is the brand. The cost of that consistency is
// that nothing in the pixels distinguishes "this is a picture of an idea" from "this number came
// out of the database ninety milliseconds ago."
//
// So every frame gets one of these, and it is a component rather than a copied pair of <span>s
// precisely so that adding a frame without a note requires deleting something visible rather than
// just forgetting.
export function SurfaceNote({ label, detail }: { label: string; detail: string }) {
  return (
    <p className="surface-note">
      <strong>{label}</strong>
      <span>{detail}</span>
    </p>
  )
}
