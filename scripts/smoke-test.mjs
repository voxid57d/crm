import assert from "node:assert/strict";

const base = "http://127.0.0.1:3000";
const publicRoutes = [
  ["/login", "Welcome back"],
  ["/register", "Create your account"],
  ["/forgot-password", "Forgot your password?"],
  ["/setup", "Connect local Supabase"],
];
for (const [route, content] of publicRoutes) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, route);
  assert.ok(
    (await response.text()).includes(content),
    route + ": rendered content",
  );
  console.log("PASS public " + route);
}
const protectedRoutes = [
  "/scheduling/closures",
  "/scheduling/closures/new",
  "/scheduling/closures/00000000-0000-0000-0000-000000000001",
  "/scheduling/changes",
  "/scheduling/generation/00000000-0000-0000-0000-000000000001",
  "/groups/00000000-0000-0000-0000-000000000001/schedules/exceptions",
  "/attendance",
  "/attendance/history",
  "/lessons/00000000-0000-0000-0000-000000000001/attendance",
  "/academics",
  "/students/00000000-0000-0000-0000-000000000001/timetable",
  "/enrollments/00000000-0000-0000-0000-000000000001/invoice",
  "/dashboard",
  "/businesses",
  "/businesses/new",
  "/branches",
  "/team",
  "/settings",
  "/reset-password",
  "/employees",
  "/employees/new",
  "/customers",
  "/customers/new",
  "/customers/archived",
  "/customers/settings",
  "/customers/00000000-0000-0000-0000-000000000001",
  "/customers/00000000-0000-0000-0000-000000000001/edit",
  "/students",
  "/courses",
  "/groups",
  "/groups/new",
  "/groups/00000000-0000-0000-0000-000000000001/schedules",
  "/groups/00000000-0000-0000-0000-000000000001/schedules/new",
  "/groups/00000000-0000-0000-0000-000000000001/schedules/00000000-0000-0000-0000-000000000002",
  "/lessons",
  "/lessons/new",
  "/lessons/00000000-0000-0000-0000-000000000001",
  "/lessons/00000000-0000-0000-0000-000000000001/edit",
  "/lessons/00000000-0000-0000-0000-000000000001/reschedule",
  "/timetable",
  "/groups/00000000-0000-0000-0000-000000000001",
  "/groups/00000000-0000-0000-0000-000000000001/edit",
  "/groups/00000000-0000-0000-0000-000000000001/teachers",
  "/groups/00000000-0000-0000-0000-000000000001/enroll",
  "/enrollments",
  "/enrollments/00000000-0000-0000-0000-000000000001",
  "/enrollments/00000000-0000-0000-0000-000000000001/transfer",
  "/courses/new",
  "/courses/settings",
  "/courses/00000000-0000-0000-0000-000000000001",
  "/courses/00000000-0000-0000-0000-000000000001/edit",
  "/classrooms",
  "/classrooms/new",
  "/classrooms/00000000-0000-0000-0000-000000000001",
  "/classrooms/00000000-0000-0000-0000-000000000001/edit",
  "/modules/courses",
  "/students/new",
  "/students/archived",
  "/students/00000000-0000-0000-0000-000000000001",
  "/students/00000000-0000-0000-0000-000000000001/edit",
  "/students/00000000-0000-0000-0000-000000000001/finance",
  "/leads",
  "/leads/new",
  "/leads/00000000-0000-0000-0000-000000000001",
  "/leads/00000000-0000-0000-0000-000000000001/edit",
  "/sales",
  "/sales/board",
  "/sales/follow-ups",
  "/sales/reports",
  "/sales/settings/pipelines",
  "/sales/settings/sources",
  "/finance",
  "/finance/cashboxes",
  "/finance/cashboxes/new",
  "/finance/invoices",
  "/finance/invoices/new",
  "/finance/invoices/00000000-0000-0000-0000-000000000001",
  "/finance/invoices/00000000-0000-0000-0000-000000000001/edit",
  "/finance/invoices/00000000-0000-0000-0000-000000000001/print",
  "/finance/debts",
  "/finance/payments",
  "/finance/payments/new",
  "/finance/expenses",
  "/finance/expenses/new",
  "/finance/expenses/categories",
  "/finance/expenses/00000000-0000-0000-0000-000000000001",
  "/finance/transfers",
  "/finance/transfers/new",
  "/finance/transfers/00000000-0000-0000-0000-000000000001",
  "/finance/refunds",
  "/finance/transactions/00000000-0000-0000-0000-000000000001",
  "/finance/reports",
  "/finance/reports/export?report=payments",
  "/finance/payments/00000000-0000-0000-0000-000000000001",
  "/customers/00000000-0000-0000-0000-000000000001/finance",
  "/finance/cashboxes/00000000-0000-0000-0000-000000000001",
  "/finance/cashboxes/00000000-0000-0000-0000-000000000001/edit",
  "/employees/00000000-0000-0000-0000-000000000001",
  "/employees/00000000-0000-0000-0000-000000000001/edit",
  "/roles",
  "/invitations/accept",
  ...[
    "students",
    "courses",
    "schedule",
    "attendance",
    "leads",
    "finance",
    "team",
    "branches",
  ].map((slug) => "/modules/" + slug),
];
for (const route of protectedRoutes) {
  const response = await fetch(base + route, {
    redirect: "manual",
    headers: {
      Cookie:
        "forma-tenant=10000000-0000-0000-0000-000000000001; forma-branch=20000000-0000-0000-0000-000000000001",
    },
  });
  assert.equal(response.status, 307, route);
  assert.equal(response.headers.get("location"), "/login", route);
  console.log("PASS protected " + route);
}
const home = await fetch(base, { redirect: "manual" });
const invitation = await fetch(base + "/invite/" + "a".repeat(64), {
  redirect: "manual",
});
assert.equal(invitation.status, 307);
assert.equal(
  new URL(invitation.headers.get("location")).pathname,
  "/invitations/accept",
);
assert.match(
  invitation.headers.get("set-cookie") ?? "",
  /forma-invitation=.*HttpOnly/i,
);
assert.match(invitation.headers.get("cache-control") ?? "", /no-store/);
const invalidInvite = await fetch(base + "/invite/invalid", {
  redirect: "manual",
});
assert.equal(new URL(invalidInvite.headers.get("location")).pathname, "/login");
assert.equal(home.status, 307);
assert.equal(home.headers.get("location"), "/dashboard");
for (const route of ["/admin", "/platform"]) {
  assert.equal((await fetch(base + route)).status, 404, route);
}
const callback = await fetch(
  base + "/auth/callback?next=https://evil.example",
  { redirect: "manual" },
);
assert.equal(callback.status, 307);
const destination = new URL(callback.headers.get("location"));
assert.equal(destination.origin, base);
assert.equal(destination.pathname, "/login");
console.log(
  "PASS home redirect, absent platform routes, and safe invalid callback",
);
