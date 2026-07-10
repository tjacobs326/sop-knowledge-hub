const origin = (process.env.TARGET_ORIGIN || "http://127.0.0.1:8788").replace(/\/$/, "");

async function request(path, init = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const session = await request("/api/auth/session");
  assert(session.response.ok, "Guest session endpoint should respond.");
  assert(session.body.data?.guest === true, "Unauthenticated requests should be guest sessions.");
  assert(
    !session.body.data?.user?.permissions?.includes("Create SOPs"),
    "Guest sessions must not include write permissions.",
  );

  const sops = await request("/api/sops?limit=5&subRole=subrole-multimedia", {
    headers: { "x-sop-sub-role": "subrole-multimedia" },
  });
  assert(sops.response.ok, "Guest users should view published SOPs.");
  assert(
    (sops.body.data?.sops || sops.body.sops || []).every((sop) => sop.status === "Published"),
    "Guest SOP list must only include published SOPs.",
  );

  const createOptions = await request("/api/create-options", {
    headers: { "x-sop-sub-role": "subrole-multimedia" },
  });
  assert(createOptions.response.status === 401 || createOptions.response.status === 403, "Guest cannot load create options.");

  const requestCreate = await request("/api/sop-requests", {
    method: "POST",
    body: JSON.stringify({
      requestType: "Request a new SOP",
      requestedTitle: "Guest escalation attempt",
      departmentName: "Testing",
      submittedByName: "Guest",
      submittedByEmail: "guest@example.org",
      description: "This should not be accepted from guest mode.",
    }),
  });
  assert(requestCreate.response.status === 401 || requestCreate.response.status === 403, "Guest cannot submit SOP requests.");

  const reviewQueue = await request("/api/review-queue", {
    headers: { "x-sop-sub-role": "subrole-multimedia" },
  });
  assert(reviewQueue.response.status === 401 || reviewQueue.response.status === 403, "Guest cannot access review queue.");

  const standardCreate = await request("/api/create-options", {
    headers: { "x-sop-dev-role": "normal", "x-sop-sub-role": "subrole-multimedia" },
  });
  assert(standardCreate.response.status === 403, "Standard users cannot create SOPs even with a sub-role header.");

  const subRoles = [
    "subrole-instructional-technology-specialist",
    "subrole-instructional-designer",
    "subrole-project-manager",
    "subrole-quality-assurance-specialist",
    "subrole-multimedia",
  ];
  for (const subRole of subRoles) {
    const creatorSession = await request("/api/auth/session", {
      headers: { "x-sop-dev-role": "creator", "x-sop-sub-role": subRole },
    });
    assert(creatorSession.body.data?.user?.role === "creator", `Creator session should load for ${subRole}.`);
    assert(
      creatorSession.body.data?.user?.selectedSubRole?.id === subRole,
      `Creator selected sub-role should be backend-authorized for ${subRole}.`,
    );

    const creatorOptions = await request("/api/create-options", {
      headers: { "x-sop-dev-role": "creator", "x-sop-sub-role": subRole },
    });
    assert(creatorOptions.response.ok, `Creator should load create options for ${subRole}.`);
  }

  const adminSession = await request("/api/auth/session", {
    headers: { "x-sop-dev-role": "admin" },
  });
  assert(adminSession.body.data?.allowedRoles?.includes("admin"), "Admin session should allow admin view.");

  console.log(`Access-control smoke tests passed against ${origin}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
