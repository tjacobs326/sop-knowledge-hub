import { cacheHeaders, success } from "../../_shared/api";
import { getAuthUser } from "../../_shared/auth";
import { type PagesFunctionContext } from "../../_shared/cloudflare";

function landingPageFor(role: string, hasSubRole: boolean) {
  if (role === "admin") return "/admin/users/";
  if (role === "creator") return hasSubRole ? "/my-work/" : "/";
  return "/";
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const user = await getAuthUser(context);
  const isGuest = Boolean(user?.isGuest);
  const subRoles = user?.subRoles || [];
  const allowedRoles = isGuest ? ["guest", "normal"] : user?.role === "admin" ? ["normal", "creator", "admin"] : [user?.role || "normal"];

  return success(
    {
      authenticated: Boolean(user && !isGuest),
      guest: isGuest,
      user: user
        ? {
            id: isGuest ? "guest" : user.id,
            name: user.name,
            email: isGuest ? "" : user.email,
            role: user.role,
            accessLevel: user.accessLevel === "Normal User" ? "Standard User" : user.accessLevel,
            permissions: user.permissions,
            subRoles,
            selectedSubRole: user.selectedSubRole,
            landingPage: landingPageFor(user.role, Boolean(user.selectedSubRole || subRoles.length)),
          }
        : null,
      allowedRoles,
      guestPolicy:
        "Guest mode can view published SOPs, search, categories, and guided finder results. Write, workflow, assignment, unpublished SOP, and admin actions require login and matching backend permissions.",
      loginUrl: "/cdn-cgi/access/login",
      logoutUrl: "/cdn-cgi/access/logout",
    },
    undefined,
    200,
    { headers: cacheHeaders("private") },
  );
};
