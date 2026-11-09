// admin.theluttrellberkeley.com/ opens the editor; every other host serves the site as usual.
export function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname.startsWith("admin.")) return Response.redirect(`${url.origin}/admin/`, 302);
  return next();
}
