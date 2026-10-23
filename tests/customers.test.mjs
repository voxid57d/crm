import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";

test("customers, students, protected notes and normalized guardians", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const uid = (n) => `60000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 5; n++)
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        uid(n),
        `customer-qa${n}@example.test`,
        JSON.stringify({ full_name: `Actor ${n}` }),
      ],
    );
  await as(1);
  const a = (await rows("select public.create_business('Customer A') id"))[0]
    .id;
  const a1 = (await rows("select id from public.branches"))[0].id;
  const a2 = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Second') returning id",
      [a],
    )
  )[0].id;
  await as(2);
  const b = (await rows("select public.create_business('Customer B') id"))[0]
    .id;
  const b1 = (await rows("select id from public.branches"))[0].id;
  await as(1);
  const profile = {
    first_name: "Ali",
    last_name: "Karimov",
    phone: "+998 90 123 45 67",
  };
  const save = async (
    tenant,
    id,
    branches,
    p = {},
    student = null,
    tags = [],
    fields = {},
  ) =>
    (
      await rows("select public.save_customer($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        id,
        { ...profile, ...p },
        branches,
        tags,
        student,
        fields,
      ])
    )[0].id;
  const dir = async (tenant, filters = {}) =>
    rows(
      "select * from public.customer_directory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        tenant,
        filters.q ?? "",
        filters.branch ?? null,
        filters.status ?? null,
        filters.employee ?? null,
        filters.tag ?? null,
        filters.archived ?? false,
        filters.students ?? false,
        filters.sort ?? "name",
        filters.page ?? 0,
      ],
    );
  let c, shared, student, guardian, note, tag, field;
  const education = {
    student_identifier: "ST-001",
    education_status: "active",
    school: "School 1",
  };
  await t.test(
    "Owner creates optional-field contacts and a normalized student with shared branches",
    async () => {
      c = await save(a, null, [a1]);
      shared = await save(a, null, [a1, a2], { first_name: "Shared" });
      student = await save(
        a,
        null,
        [a1],
        { first_name: "Student", phone: "555-001" },
        education,
      );
      assert.equal(
        (await rows("select email from public.customers where id=$1", [c]))[0]
          .email,
        null,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.customer_branches where customer_id=$1",
            [shared],
          )
        )[0].n,
        2,
      );
      assert.equal(
        (await rows("select count(*)::int n from public.student_profiles"))[0]
          .n,
        1,
      );
      assert.equal((await dir(a, { students: true }))[0].id, student);
    },
  );
  await t.test(
    "Same phone is permitted and duplicates are suggestions, including normalized phones",
    async () => {
      const duplicate = await save(a, null, [a1], {
        first_name: "Other",
        phone: "998901234567",
      });
      const matches = await rows(
        "select * from public.customer_duplicate_candidates($1,'998901234567','','',$2)",
        [a, c],
      );
      assert.ok(matches.some((x) => x.id === duplicate));
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        4,
      );
    },
  );
  await t.test(
    "Status/tag/field configuration is tenant-bound and custom values are validated",
    async () => {
      tag = (
        await rows(
          "select public.save_customer_setting($1,null,'tag','VIP') id",
          [a],
        )
      )[0].id;
      field = (
        await rows(
          "select public.save_customer_setting($1,null,'field','Preferred score','number') id",
          [a],
        )
      )[0].id;
      await save(a, c, [a1], {}, null, [tag], { [field]: "7.500000" });
      assert.equal(
        (
          await rows(
            "select value from public.customer_field_values where customer_id=$1",
            [c],
          )
        )[0].value,
        "7.500000",
      );
      await assert.rejects(
        save(a, c, [a1], {}, null, [], { [field]: "NaN" }),
        /Invalid custom number/,
      );
      await assert.rejects(
        rows(
          "select public.save_customer_setting($1,$2,'field','Renamed','text')",
          [a, field],
        ),
        /type changed/,
      );
    },
  );
  await t.test(
    "Profile updates and branch/status/responsible changes have immutable actual audit records",
    async () => {
      const employee = (
        await rows(
          "select public.save_employee($1,null,'Sales person','','','Sales','active','2026-10-23','',$2) id",
          [a, [a1]],
        )
      )[0].id;
      const active = (
        await rows(
          "select id from public.customer_statuses where tenant_id=$1 and name='Active'",
          [a],
        )
      )[0].id;
      await save(
        a,
        c,
        [a1],
        {
          first_name: "Updated Ali",
          status_id: active,
          responsible_employee_id: employee,
        },
        null,
        [tag],
      );
      const kinds = (
        await rows(
          "select kind from public.customer_activities where customer_id=$1",
          [c],
        )
      ).map((x) => x.kind);
      for (const k of [
        "created",
        "profile_updated",
        "branches_changed",
        "status_changed",
        "responsible_changed",
        "tags_changed",
        "custom_fields_updated",
      ])
        assert.ok(kinds.includes(k), k);
      await assert.rejects(
        db.query("update public.customer_activities set kind='forged'"),
        /permission denied/,
      );
      assert.equal((await dir(a, { employee }))[0].id, c);
    },
  );
  await t.test(
    "Search literal text, phone normalization, filters, sorting and pagination use authorized records",
    async () => {
      assert.equal((await dir(a, { q: "updated ali" }))[0].id, c);
      assert.ok((await dir(a, { q: "901234567" })).length >= 2);
      assert.equal((await dir(a, { tag }))[0].id, c);
      assert.equal((await dir(a, { q: "%" })).length, 0);
      assert.equal((await dir(a, { branch: a2 })).length, 1);
      for (let i = 0; i < 21; i++)
        await save(a, null, [a1], {
          first_name: `Page ${String(i).padStart(2, "0")}`,
          phone: `777${i}`,
        });
      const first = await dir(a, { q: "Page" }),
        second = await dir(a, { q: "Page", page: 1 });
      assert.equal(first.length, 20);
      assert.equal(second.length, 1);
      assert.equal(Number(first[0].total_count), 21);
      assert.ok(!first.some((x) => x.id === second[0].id));
      await assert.rejects(
        dir(a, { sort: "id;drop table" }),
        /Invalid directory/,
      );
    },
  );
  await t.test(
    "Notes record verified author, restricted visibility and protected edit history",
    async () => {
      note = (
        await rows(
          "select public.save_customer_note($1,$2,null,'Private discussion','call') id",
          [a, c],
        )
      )[0].id;
      const saved = (
        await rows("select * from public.customer_notes where id=$1", [note])
      )[0];
      assert.equal(saved.author_id, uid(1));
      assert.equal(saved.author_name, "Actor 1");
      await rows(
        "select public.save_customer_note($1,$2,$3,'Corrected discussion','call')",
        [a, c, note],
      );
      assert.ok(
        (
          await rows(
            "select detail from public.customer_activities where customer_id=$1 and kind='note_edited'",
            [c],
          )
        )[0].detail.before.includes("Private discussion"),
      );
      await assert.rejects(
        db.query("delete from public.customer_notes"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "Guardians are reused across students; relationship changes preserve contacts",
    async () => {
      guardian = (
        await rows(
          "select public.save_student_guardian($1,$2,null,'Parent Name','99890000','','Mother',true) id",
          [a, student],
        )
      )[0].id;
      const sibling = await save(
        a,
        null,
        [a2],
        { first_name: "Sibling", phone: "555-002" },
        { ...education, student_identifier: "ST-002" },
      );
      await rows(
        "select public.save_student_guardian($1,$2,$3,'','','','Mother',false)",
        [a, sibling, guardian],
      );
      assert.equal(
        (await rows("select count(*)::int n from public.guardians"))[0].n,
        1,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_guardians where guardian_id=$1",
            [guardian],
          )
        )[0].n,
        2,
      );
      await assert.rejects(
        rows(
          "select public.save_student_guardian($1,$2,$3,'','','','Parent',false)",
          [a, c, guardian],
        ),
        /Student profile required/,
      );
    },
  );
  await t.test(
    "Branch Manager cannot read or alter partially authorized shared customers or guardians",
    async () => {
      await rows("select public.set_business_member($1,$2,'manager',$3)", [
        a,
        `customer-qa3@example.test`,
        [a1],
      ]);
      await as(3);
      assert.equal(
        (await rows("select * from public.customers where id=$1", [shared]))
          .length,
        0,
      );
      await assert.rejects(save(a, shared, [a1]), /Customer update denied/);
      await assert.rejects(save(a, c, [a1, b1]), /branch access denied/);
      await assert.rejects(
        rows("select public.archive_customer($1,$2,true)", [a, c]),
        /archive denied/,
      );
      await assert.rejects(
        rows(
          "select public.save_student_guardian($1,$2,$3,'Changed','99890000','','Mother',true)",
          [a, student, guardian],
        ),
        /all student scopes/,
      );
      assert.equal(
        (
          await rows("select full_name from public.guardians where id=$1", [
            guardian,
          ])
        )[0].full_name,
        "Parent Name",
      );
      await assert.rejects(
        rows("select public.save_customer_note($1,$2,$3,'Tampered','note')", [
          a,
          c,
          note,
        ]),
        /Only author/,
      );
      await assert.rejects(dir(a, { branch: a2 }), /Branch access denied/);
      await as(1);
    },
  );
  await t.test(
    "Custom customer-view role cannot read notes through table or audit APIs or promote itself",
    async () => {
      const role = (
        await rows(
          "select public.save_business_role($1,null,'Contact viewer','branch',$2) id",
          [a, ["branches.view", "customers.view"]],
        )
      )[0].id;
      await rows("select public.assign_member_role($1,$2,$3,$4)", [
        a,
        uid(4),
        role,
        [a1],
      ]);
      await as(4);
      assert.ok(
        (await rows("select id from public.customers where id=$1", [c])).length,
      );
      assert.equal(
        (await rows("select * from public.customer_notes")).length,
        0,
      );
      assert.equal(
        (
          await rows(
            "select * from public.customer_activities where notes_only",
          )
        ).length,
        0,
      );
      await assert.rejects(
        rows("select public.save_customer_setting($1,null,'tag','Hacked')", [
          a,
        ]),
        /settings denied/,
      );
      await assert.rejects(
        rows("select public.assign_member_role($1,$2,$3,$4)", [
          a,
          uid(4),
          role,
          [a1, a2],
        ]),
        /Role management denied/,
      );
      await as(1);
    },
  );
  await t.test(
    "Different roles in two branches do not merge update permissions",
    async () => {
      const viewer = (
        await rows(
          "select public.save_business_role($1,null,'Branch customer viewer','branch',$2) id",
          [a, ["branches.view", "customers.view"]],
        )
      )[0].id;
      const editor = (
        await rows(
          "select public.save_business_role($1,null,'Branch customer editor','branch',$2) id",
          [a, ["branches.view", "customers.view", "customers.update"]],
        )
      )[0].id;
      const secondOnly = await save(a, null, [a2], {
        first_name: "Second branch contact",
        phone: "555222",
      });
      await rows("select public.assign_member_role($1,$2,$3,$4,$5)", [
        a,
        uid(5),
        viewer,
        [a1, a2],
        { [a2]: editor },
      ]);
      await as(5);
      assert.equal(
        (await rows("select id from public.customers where id=$1", [shared]))
          .length,
        1,
      );
      await assert.rejects(save(a, shared, [a1, a2]), /Customer update denied/);
      await save(a, secondOnly, [a2], {
        first_name: "Permitted branch edit",
        phone: "555222",
      });
      assert.ok(
        (await dir(a, { branch: a2 })).some((c) => c.id === secondOnly),
      );
      await as(1);
    },
  );
  await t.test(
    "Unlinked guardian remains reusable by business administrators without duplication",
    async () => {
      const links = await rows(
        "select customer_id from public.student_guardians where guardian_id=$1",
        [guardian],
      );
      for (const link of links)
        await rows("select public.unlink_student_guardian($1,$2,$3)", [
          a,
          link.customer_id,
          guardian,
        ]);
      assert.equal(
        (await rows("select id from public.guardians where id=$1", [guardian]))
          .length,
        1,
      );
      await as(3);
      assert.equal(
        (await rows("select id from public.guardians where id=$1", [guardian]))
          .length,
        0,
      );
      await as(1);
      await rows(
        "select public.save_student_guardian($1,$2,$3,'','','','Parent',true)",
        [a, student, guardian],
      );
      assert.equal(
        (await rows("select count(*)::int n from public.guardians"))[0].n,
        1,
      );
    },
  );
  await t.test(
    "Archive/restore preserves student, notes, relationships and complete history",
    async () => {
      await rows("select public.archive_customer($1,$2,true)", [a, c]);
      assert.equal((await dir(a, { archived: true }))[0].id, c);
      assert.ok(!(await dir(a)).some((x) => x.id === c));
      assert.ok(
        (
          await rows(
            "select * from public.customer_notes where customer_id=$1",
            [c],
          )
        ).length,
      );
      await assert.rejects(save(a, c, [a1]), /Restore customer/);
      await rows("select public.archive_customer($1,$2,false)", [a, c]);
      const history = await rows(
        "select kind from public.customer_activities where customer_id=$1 and kind in ('archived','restored')",
        [c],
      );
      assert.equal(history.length, 2);
    },
  );
  await t.test(
    "Two-way tenant isolation, foreign IDs, anonymous roles and suspended memberships",
    async () => {
      await as(2);
      const foreign = await save(b, null, [b1]);
      assert.equal(
        (await rows("select * from public.customers where tenant_id=$1", [a]))
          .length,
        0,
      );
      await assert.rejects(save(a, c, [a1]), /Customer update denied/);
      await assert.rejects(dir(a), /Business access denied/);
      assert.equal(
        (
          await rows(
            "select * from public.customer_duplicate_candidates($1,'998901234567')",
            [a],
          )
        ).length,
        0,
      );
      await assert.rejects(
        rows(
          "select public.save_student_guardian($1,$2,$3,'','','','Parent')",
          [b, foreign, guardian],
        ),
        /Student profile required/,
      );
      await as(1);
      assert.equal(
        (await rows("select * from public.customers where id=$1", [foreign]))
          .length,
        0,
      );
      await assert.rejects(save(a, null, [b1]), /Branch does not belong/);
      await assert.rejects(
        save(a, c, [a1], {}, null, ["00000000-0000-0000-0000-000000000001"]),
        /Invalid customer tag/,
      );
      await db.exec("reset role; set role anon");
      await assert.rejects(
        db.query("select * from public.customers"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.customer_directory($1)", [a]),
        /permission denied/,
      );
      await as(null);
      assert.equal((await rows("select * from public.customers")).length, 0);
      await as(1);
      await rows(
        "select public.set_business_member($1,$2,'manager',$3,false)",
        [a, `customer-qa3@example.test`, [a1]],
      );
      await as(3);
      assert.equal((await rows("select * from public.customers")).length, 0);
    },
  );
});
