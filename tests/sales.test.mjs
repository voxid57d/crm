import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";

test("sales core, permissions, follow-ups and atomic customer conversion", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const uid = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 4; n++)
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [uid(n), `sales${n}@example.test`, { full_name: `Sales Actor ${n}` }],
    );
  await as(1);
  const a = (await rows("select public.create_business('Sales A') id"))[0].id;
  const a1 = (await rows("select id from public.branches"))[0].id;
  const a2 = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Other sales branch') returning id",
      [a],
    )
  )[0].id;
  const pipeline = (
    await rows("select id from public.sales_pipelines where tenant_id=$1", [a])
  )[0].id;
  const stages = await rows(
    "select * from public.sales_stages where tenant_id=$1 order by position",
    [a],
  );
  const open = stages[0].id,
    contacted = stages[1].id,
    won = stages.find((s) => s.outcome === "won").id,
    lost = stages.find((s) => s.outcome === "lost").id;
  const reason = (
    await rows("select id from public.lead_loss_reasons where tenant_id=$1", [
      a,
    ])
  )[0].id;
  await as(2);
  const b = (await rows("select public.create_business('Sales B') id"))[0].id;
  const b1 = (await rows("select id from public.branches"))[0].id;
  await as(1);
  const create = async (branch = a1, extra = {}, id = null) =>
    (
      await rows("select public.save_lead($1,$2,$3) id", [
        a,
        id,
        {
          branch_id: branch,
          pipeline_id: pipeline,
          stage_id: open,
          first_name: "Ali",
          phone: "+998 90 123 45 67",
          ...extra,
        },
      ])
    )[0].id;
  let lead, emp, followup;
  await t.test(
    "business pipelines, stages, sources and loss reasons seed without sample leads",
    async () => {
      assert.equal(stages.length, 9);
      assert.equal(
        (await rows("select count(*)::int n from public.lead_sources"))[0].n,
        9,
      );
      assert.equal(
        (await rows("select count(*)::int n from public.leads"))[0].n,
        0,
      );
      lead = await create();
      const r = (
        await rows("select * from public.leads where id=$1", [lead])
      )[0];
      assert.equal(r.email, null);
      assert.equal(r.phone_normalized, "998901234567");
      await create(a1, { first_name: "Shared phone" });
      assert.equal(
        (await rows("select count(*)::int n from public.leads"))[0].n,
        2,
      );
    },
  );
  await t.test(
    "creation/edit/stage transitions persist and history cannot be rewritten",
    async () => {
      await create(a1, { first_name: "Updated lead" }, lead);
      await rows("select public.move_lead($1,$2,$3,$4)", [
        a,
        lead,
        contacted,
        open,
      ]);
      assert.equal(
        (await rows("select stage_id from public.leads where id=$1", [lead]))[0]
          .stage_id,
        contacted,
      );
      await assert.rejects(
        rows("select public.move_lead($1,$2,$3,$4)", [a, lead, open, open]),
        /Lead changed/,
      );
      await assert.rejects(
        rows("select public.move_lead($1,$2,$3,$4)", [a, lead, won, contacted]),
        /Use customer conversion/,
      );
      await assert.rejects(
        db.query("update public.lead_activities set kind='forged'"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("delete from public.sales_stages"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "only authorized administrators configure pipelines; stages can reorder, rename, deactivate with history",
    async () => {
      await rows("select public.reorder_sales_stages($1,$2,$3)", [
        a,
        pipeline,
        stages.map((s) => s.id).reverse(),
      ]);
      await rows("select public.save_sales_setting($1,$2,'stage',$3)", [
        a,
        contacted,
        {
          name: "Reached",
          pipeline_id: pipeline,
          position: 5,
          color: "#123abc",
          outcome: "open",
          is_active: false,
        },
      ]);
      assert.equal(
        (
          await rows("select is_active from public.sales_stages where id=$1", [
            contacted,
          ])
        )[0].is_active,
        false,
      );
      assert.ok(
        (await rows("select * from public.sales_configuration_history"))
          .length >= 2,
      );
      await assert.rejects(
        rows("select public.save_sales_setting($1,$2,'stage',$3)", [
          a,
          contacted,
          {
            name: "Wrong outcome",
            pipeline_id: pipeline,
            position: 5,
            color: "#ffffff",
            outcome: "won",
          },
        ]),
        /outcome cannot change/,
      );
      await rows("select public.move_lead($1,$2,$3,$4)", [
        a,
        lead,
        open,
        contacted,
      ]);
    },
  );
  await t.test(
    "branch-scoped sales accounts cannot access foreign branches or assign non-sales employees",
    async () => {
      await rows(
        "select public.set_business_member($1,'sales3@example.test','manager',$2)",
        [a, [a1]],
      );
      emp = (
        await rows(
          "select public.save_employee($1,null,'Sales employee','','sales3@example.test','Sales','active','2026-10-23','',$2) id",
          [a, [a1]],
        )
      )[0].id;
      // Use the real invitation path to link the existing Auth account.
      const role = (
        await rows(
          "select id from public.business_roles where tenant_id=$1 and system_key='manager'",
          [a],
        )
      )[0].id;
      const token = (
        await rows("select public.create_employee_invitation($1,$2,$3) token", [
          a,
          emp,
          role,
        ])
      )[0].token;
      await as(3);
      await rows("select public.accept_employee_invitation($1)", [token]);
      await assert.rejects(create(a2), /branch denied/);
      await assert.rejects(
        rows(
          "select public.save_sales_setting($1,null,'source','{\"name\":\"Hacked\"}')",
          [a],
        ),
        /configuration denied/,
      );
      await create(a1, { assigned_employee_id: emp });
      await as(1);
      const offline = (
        await rows(
          "select public.save_employee($1,null,'Offline','','','Cleaner','active','2026-10-23','',$2) id",
          [a, [a1]],
        )
      )[0].id;
      await assert.rejects(
        create(a1, { assigned_employee_id: offline }),
        /not authorized for sales/,
      );
      await assert.rejects(
        create(a2, { assigned_employee_id: emp }),
        /not authorized for sales/,
      );
    },
  );
  await t.test(
    "follow-ups store offset-aware times, verified completion and immutable outcomes",
    async () => {
      followup = (
        await rows("select public.save_lead_followup($1,$2,null,$3) id", [
          a,
          lead,
          {
            responsible_employee_id: emp,
            kind: "phone_call",
            description: "Call tomorrow",
            scheduled_at: "2026-10-24T09:00:00+05:00",
          },
        ])
      )[0].id;
      await rows("select public.save_lead_followup($1,$2,$3,$4)", [
        a,
        lead,
        followup,
        {
          responsible_employee_id: emp,
          kind: "meeting",
          description: "Updated meeting",
          scheduled_at: "2026-10-24T10:00:00+05:00",
        },
      ]);
      await rows(
        "select public.complete_lead_followup($1,$2,'Discussed pricing')",
        [a, followup],
      );
      const f = (
        await rows("select * from public.lead_followups where id=$1", [
          followup,
        ])
      )[0];
      assert.equal(f.completed_by, uid(1));
      assert.ok(f.completed_at);
      await assert.rejects(
        rows("select public.save_lead_followup($1,$2,$3,$4)", [
          a,
          lead,
          followup,
          {},
        ]),
        /Only pending/,
      );
      await assert.rejects(
        rows("select public.save_lead_followup($1,$2,null,$3)", [
          a,
          lead,
          {
            responsible_employee_id: emp,
            kind: "meeting",
            description: "Bad timestamp",
            scheduled_at: "2026-10-24T10:00",
          },
        ]),
        /requires offset/,
      );
    },
  );
  await t.test(
    "lost/disqualified and reopening preserve reason, actor and prior outcome history",
    async () => {
      await assert.rejects(
        rows("select public.move_lead($1,$2,$3,$4)", [a, lead, lost, open]),
        /loss reason/,
      );
      await rows("select public.move_lead($1,$2,$3,$4,$5,'Budget changed')", [
        a,
        lead,
        lost,
        open,
        reason,
      ]);
      const r = (
        await rows("select * from public.leads where id=$1", [lead])
      )[0];
      assert.equal(r.status, "lost");
      assert.equal(r.lost_by, uid(1));
      assert.ok(r.lost_at);
      await rows("select public.move_lead($1,$2,$3,$4)", [a, lead, open, lost]);
      assert.ok(
        (
          await rows(
            "select * from public.lead_activities where lead_id=$1 and kind='reopened'",
            [lead],
          )
        )[0].detail.previous_notes.includes("Budget"),
      );
    },
  );
  await t.test(
    "conversion creates once, preserves source/assignment and is idempotent",
    async () => {
      const customer = (
        await rows("select public.convert_lead($1,$2) id", [a, lead])
      )[0].id;
      const repeated = (
        await rows("select public.convert_lead($1,$2) id", [a, lead])
      )[0].id;
      assert.equal(repeated, customer);
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.customers where id=$1",
            [customer],
          )
        )[0].n,
        1,
      );
      const l = (
        await rows("select * from public.leads where id=$1", [lead])
      )[0];
      assert.equal(l.status, "converted");
      assert.ok(l.converted_at);
      assert.equal(l.pipeline_id, pipeline);
      await assert.rejects(
        create(a1, {}, lead),
        /converted lead cannot be edited/,
      );
    },
  );
  await t.test(
    "existing matches require a deliberate choice, linking preserves customer contact and conversion failures roll back",
    async () => {
      const next = await create(a1, { phone: "998901234567" });
      const before = (
        await rows("select count(*)::int n from public.customers")
      )[0].n;
      await assert.rejects(
        rows("select public.convert_lead($1,$2)", [a, next]),
        /Possible customer matches/,
      );
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        before,
      );
      assert.equal(
        (await rows("select status from public.leads where id=$1", [next]))[0]
          .status,
        "open",
      );
      const c = (
        await rows("select customer_id from public.leads where id=$1", [lead])
      )[0].customer_id;
      await rows("select public.convert_lead($1,$2,$3)", [a, next, c]);
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        before,
      );
      const failed = await create(a1, { phone: "555999" });
      await db.exec("reset role");
      await db.exec(
        "create function public.fail_conversion_test() returns trigger language plpgsql as $$begin if new.status='converted' then raise exception 'Forced transaction failure';end if;return new;end$$; create trigger fail_conversion_test before update on public.leads for each row execute function public.fail_conversion_test()",
      );
      await as(1);
      await assert.rejects(
        rows("select public.convert_lead($1,$2)", [a, failed]),
        /Forced transaction failure/,
      );
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        before,
      );
      await db.exec(
        "reset role;drop trigger fail_conversion_test on public.leads;drop function public.fail_conversion_test()",
      );
      await as(1);
    },
  );
  await t.test(
    "directory, per-column counts, duplicate search and analytics use the same authorized cohort",
    async () => {
      const listing = (
        await rows("select public.lead_directory($1,'{}') result", [a])
      )[0].result;
      const count = (
        await rows(
          "select count(*)::int n from public.leads where archived_at is null",
        )
      )[0].n;
      assert.equal(listing.total, count);
      assert.equal(
        Object.values(listing.stage_counts).reduce((a, b) => a + b, 0),
        count,
      );
      const board = (
        await rows("select public.lead_directory($1,$2,0,true) result", [
          a,
          { pipeline },
        ])
      )[0].result;
      assert.equal(board.total, count);
      const matches = await rows(
        "select * from public.lead_duplicate_candidates($1,'998901234567')",
        [a],
      );
      assert.ok(matches.length >= 2);
      const analytics = (
        await rows("select public.sales_analytics($1,'{}') result", [a])
      )[0].result;
      assert.equal(analytics.total, count);
      assert.equal(analytics.converted, 2);
      assert.equal(
        analytics.branches.reduce((sum, v) => sum + v.count, 0),
        count,
      );
      assert.equal(
        analytics.conversion_rate,
        Math.round((2 / count) * 10000) / 100,
      );
      assert.equal(
        (
          await rows("select public.sales_analytics($1,$2) result", [
            a,
            { from: "1900-01-01", until: "1900-01-02" },
          ])
        )[0].result.total,
        0,
      );
      const tasks = (
        await rows(
          'select public.sales_followup_directory($1,\'{"state":"completed"}\') result',
          [a],
        )
      )[0].result;
      assert.equal(tasks.total, 1);
      await as(3);
      await assert.rejects(
        rows("select public.lead_directory($1,$2)", [a, { branch: a2 }]),
        /Sales branch denied/,
      );
      await as(1);
    },
  );
  await t.test(
    "view-only sales roles cannot change stages, convert, edit or manage follow-ups",
    async () => {
      await as(1);
      const role = (
        await rows(
          "select public.save_business_role($1,null,'Lead viewer','branch',$2) id",
          [a, ["branches.view", "leads.view"]],
        )
      )[0].id;
      await rows("select public.assign_member_role($1,$2,$3,$4)", [
        a,
        uid(4),
        role,
        [a1],
      ]);
      const editable = await create(a1, { phone: "555123" });
      await as(4);
      assert.equal(
        (await rows("select id from public.leads where id=$1", [editable]))
          .length,
        1,
      );
      await assert.rejects(
        rows("select public.move_lead($1,$2,$3,$4)", [a, editable, lost, open]),
        /Stage change denied/,
      );
      await assert.rejects(create(a1, {}, editable), /Lead update denied/);
      await assert.rejects(
        rows("select public.convert_lead($1,$2)", [a, editable]),
        /Lead conversion denied/,
      );
      await assert.rejects(
        rows("select public.save_lead_followup($1,$2,null,$3)", [
          a,
          editable,
          {},
        ]),
        /Follow-up denied/,
      );
      await assert.rejects(
        rows("select public.sales_analytics($1)", [a]),
        /analytics denied/,
      );
      await as(1);
    },
  );
  await t.test(
    "pending follow-ups prevent a branch move that would strand an unauthorized assignee",
    async () => {
      const moving = await create(a1, { phone: "555125" });
      await rows("select public.save_lead_followup($1,$2,null,$3)", [
        a,
        moving,
        {
          responsible_employee_id: emp,
          kind: "phone_call",
          description: "Branch-sensitive task",
          scheduled_at: "2026-10-24T09:00:00Z",
        },
      ]);
      await assert.rejects(
        create(a2, { phone: "555125" }, moving),
        /pending follow-ups/,
      );
      assert.equal(
        (
          await rows("select branch_id from public.leads where id=$1", [moving])
        )[0].branch_id,
        a1,
      );
    },
  );
  await t.test(
    "one linked sales employee can be assigned in multiple authorized branches",
    async () => {
      const manager = (
        await rows(
          "select id from public.business_roles where tenant_id=$1 and system_key='manager'",
          [a],
        )
      )[0].id;
      await rows("select public.assign_member_role($1,$2,$3,$4)", [
        a,
        uid(3),
        manager,
        [a1, a2],
      ]);
      const secondBranchLead = await create(a2, {
        assigned_employee_id: emp,
        phone: "555127",
      });
      assert.equal(
        (
          await rows(
            "select assigned_employee_id from public.leads where id=$1",
            [secondBranchLead],
          )
        )[0].assigned_employee_id,
        emp,
      );
      await rows("select public.assign_member_role($1,$2,$3,$4)", [
        a,
        uid(3),
        manager,
        [a1],
      ]);
    },
  );
  await t.test(
    "Owner archive/restore preserves original lead and communication history",
    async () => {
      const archived = await create(a1, { phone: "555128" });
      await rows("select public.add_lead_note($1,$2,'Keep this interaction')", [
        a,
        archived,
      ]);
      await rows("select public.archive_lead($1,$2,true)", [a, archived]);
      await assert.rejects(create(a1, {}, archived), /Archived or converted/);
      const listing = (
        await rows("select public.lead_directory($1,$2) result", [
          a,
          { archived: true },
        ])
      )[0].result;
      assert.ok(listing.rows.some((l) => l.id === archived));
      await rows("select public.archive_lead($1,$2,false)", [a, archived]);
      assert.equal(
        (
          await rows("select body from public.lead_notes where lead_id=$1", [
            archived,
          ])
        )[0].body,
        "Keep this interaction",
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.lead_activities where lead_id=$1 and kind in ('archived','restored')",
            [archived],
          )
        )[0].n,
        2,
      );
    },
  );
  await t.test(
    "deactivated sources preserve historical associations and cannot be assigned to new leads",
    async () => {
      const source = (
        await rows("select public.save_sales_setting($1,null,'source',$2) id", [
          a,
          { name: "Local campaign" },
        ])
      )[0].id;
      const historical = await create(a1, {
        source_id: source,
        phone: "555126",
      });
      await rows("select public.save_sales_setting($1,$2,'source',$3)", [
        a,
        source,
        { name: "Previous campaign", is_active: false },
      ]);
      await create(a1, { source_id: source, phone: "555126" }, historical);
      assert.equal(
        (
          await rows("select source_id from public.leads where id=$1", [
            historical,
          ])
        )[0].source_id,
        source,
      );
      await assert.rejects(
        create(a1, { source_id: source }),
        /Invalid lead source/,
      );
    },
  );
  await t.test(
    "board caps each stage without losing exact column counts and table pagination",
    async () => {
      for (let i = 0; i < 22; i++)
        await create(a1, { first_name: "Paged sales " + i, phone: "777" + i });
      const board = (
        await rows("select public.lead_directory($1,$2,0,true) result", [
          a,
          { q: "Paged sales", pipeline },
        ])
      )[0].result;
      assert.equal(board.rows.length, 20);
      assert.equal(board.stage_counts[open], 22);
      assert.equal(board.total, 22);
      const secondPage = (
        await rows("select public.lead_directory($1,$2,1,false) result", [
          a,
          { q: "Paged sales" },
        ])
      )[0].result;
      assert.equal(secondPage.rows.length, 2);
    },
  );
  await t.test(
    "tenant/branch/permission tampering and anonymous writes cannot bypass database authorization",
    async () => {
      const foreign = await create(a2);
      await as(3);
      assert.equal(
        (await rows("select id from public.leads where id=$1", [foreign]))
          .length,
        0,
      );
      await assert.rejects(
        rows("select public.move_lead($1,$2,$3,$4)", [a, foreign, lost, open]),
        /Stage change denied/,
      );
      await assert.rejects(
        rows("select public.archive_lead($1,$2,true)", [a, lead]),
        /archive denied/,
      );
      await as(2);
      assert.equal(
        (await rows("select id from public.leads where tenant_id=$1", [a]))
          .length,
        0,
      );
      await assert.rejects(
        rows("select public.convert_lead($1,$2)", [a, lead]),
        /(Business access|Lead conversion) denied/,
      );
      await assert.rejects(
        rows("select public.save_lead($1,null,$2)", [
          b,
          {
            branch_id: a1,
            pipeline_id: pipeline,
            stage_id: open,
            first_name: "Forged",
            phone: "123",
          },
        ]),
        /branch denied/,
      );
      await as(1);
      await assert.rejects(create(b1), /branch denied/);
      await db.exec("reset role;set role anon");
      await assert.rejects(
        db.query("select * from public.leads"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.save_lead($1,null,$2)", [a, {}]),
        /permission denied/,
      );
    },
  );
});
