/**
 * Host half — no host-side behavior for this pure-surface (client CSS/JS)
 * plugin. The empty apply exists so the package appears in the web profile's
 * cordis.yml / Loader; the browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
export { apply };
