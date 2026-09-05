import { redirect } from "next/navigation";

// The ticker UI is a standalone static document in public/ rather than a React page. Next's
// `rewrites()` mapping of "/" onto it works under `next start` but is dropped by Netlify's
// runtime (public/ assets are served straight from the CDN, so the rewrite never resolves and
// "/" 404s), so send visitors there with a real redirect instead. Auth still applies: the
// middleware matcher covers /ticker.html.
export default function RootPage() {
  redirect("/ticker.html");
}
