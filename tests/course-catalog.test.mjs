import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("course catalog, exact tuition templates, scoped classrooms and retained history", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const uid = (n) => `89000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const as = async (n) => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 7; n++)
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `catalog${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
      await rows("select public.create_business('Catalog A') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id;
  const second = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Second academic branch') returning id",
      [tenant],
    )
  )[0].id;
  const setting = async (
    kind,
    name,
    id = null,
    version = 0,
    active = true,
    key = randomUUID(),
  ) =>
    (
      await rows("select public.save_course_setting($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        kind,
        id,
        key,
        version,
        name,
        active,
      ])
    )[0].id;
  const category = await setting("category", "Languages"),
    level = await setting("level", "A1");
  const input = {
    name: "General English A1",
    code: "ENG-A1",
    description: "Practical English",
    category_id: category,
    level_id: level,
    duration_value: "12",
    duration_unit: "weeks",
    lesson_duration_minutes: "90",
    standard_price: "9007199254740993.01",
    pricing_model: "monthly",
    currency: "UZS",
  };
  const course = async (
    extra = {},
    id = null,
    version = 0,
    key = randomUUID(),
  ) =>
    (
      await rows("select public.save_course($1,$2,$3,$4,$5) id", [
        tenant,
        id,
        key,
        version,
        { ...input, ...extra },
      ])
    )[0].id;
  const room = async (
    b = branch,
    extra = {},
    id = null,
    version = 0,
    key = randomUUID(),
  ) =>
    (
      await rows("select public.save_classroom($1,$2,$3,$4,$5) id", [
        tenant,
        id,
        key,
        version,
        {
          branch_id: b,
          name: "Room 101",
          description: "Projector and whiteboard",
          capacity: "12",
          ...extra,
        },
      ])
    )[0].id;
  const detail = async (id) =>
    (await rows("select public.course_details($1,$2) v", [tenant, id]))[0].v;
  const roomDetail = async (id) =>
    (await rows("select public.classroom_details($1,$2) v", [tenant, id]))[0].v;
  const active = async (kind, id, version, value, key = randomUUID()) =>
    (
      await rows("select public.set_academic_active($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        kind,
        id,
        key,
        version,
        value,
        "Catalog maintenance",
      ])
    )[0].id;
  let english, firstRoom, secondRoom, foreignCategory;
  await t.test(
    "catalog starts empty and prices use exact strings beyond JavaScript safe integers",
    async () => {
      assert.equal(
        (await rows("select public.course_directory($1) v", [tenant]))[0].v
          .total,
        0,
      );
      english = await course();
      const d = await detail(english);
      assert.equal(d.course.standard_price, "9007199254740993.01");
      assert.equal(d.course.duration_value, 12);
      assert.equal(d.course.category_name, "Languages");
      assert.equal(
        d.history.rows[0].after_data.standard_price,
        "9007199254740993.01",
      );
      await assert.rejects(
        rows("select standard_price from public.courses"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "create/edit retries are exact, updates retain IDs and stale writes are rejected",
    async () => {
      const key = randomUUID(),
        id = await course(
          { code: "RETRY", name: "Retry course", standard_price: "0" },
          null,
          0,
          key,
        );
      assert.equal(
        await course(
          { code: "RETRY", name: "Retry course", standard_price: "0.00" },
          null,
          0,
          key,
        ),
        id,
      );
      await assert.rejects(
        course({ code: "DIFFERENT" }, null, 0, key),
        /identifier/,
      );
      const k = randomUUID();
      assert.equal(
        await course({ standard_price: "100.10" }, english, 1, k),
        english,
      );
      assert.equal(
        await course({ standard_price: "100.1" }, english, 1, k),
        english,
      );
      await assert.rejects(
        course({ standard_price: "101" }, english, 1),
        /changed/,
      );
      assert.equal((await detail(english)).course.standard_price, "100.10");
      assert.equal((await detail(english)).history.total, 2);
    },
  );
  await t.test(
    "free fees are valid; negative, fractional excess, exponent, oversized and JSON numeric money are rejected",
    async () => {
      for (const price of ["-1", "1.001", "1e3", "10000000000000000", 1])
        await assert.rejects(
          course({
            code: "BAD-" + randomUUID().slice(0, 4),
            standard_price: price,
          }),
          /Invalid|precision/,
        );
      for (const extra of [
        { duration_value: "0" },
        { duration_value: "2.5" },
        { lesson_duration_minutes: "1441" },
        { duration_unit: "years" },
        { pricing_model: "automatic_billing" },
        { currency: "USD" },
      ])
        await assert.rejects(
          course({ code: "BAD-" + randomUUID().slice(0, 4), ...extra }),
          /Invalid|range/,
        );
    },
  );
  await t.test(
    "category/level names are case-insensitively unique; inactive references are retained but cannot be newly assigned",
    async () => {
      await assert.rejects(setting("category", "languages"), /unique/);
      await active("level", level, 1, false);
      assert.equal((await detail(english)).level_active, false);
      await course({ standard_price: "120" }, english, 2);
      await assert.rejects(
        course({ code: "NEW-INACTIVE" }),
        /active course level/,
      );
      await active("level", level, 2, true);
      await setting("category", "Language courses", category, 1, true);
      assert.equal(
        (await detail(english)).course.category_name,
        "Language courses",
      );
      await assert.rejects(
        setting("category", "Stale category", category, 1),
        /changed/,
      );
    },
  );
  await t.test(
    "archive/reactivate preserves original course and history; status mutation uses optimistic version",
    async () => {
      await active("course", english, 3, false);
      assert.equal((await detail(english)).course.is_active, false);
      assert.equal(
        (
          await rows("select public.course_directory($1,$2) v", [
            tenant,
            { q: "General English" },
          ])
        )[0].v.total,
        0,
      );
      assert.equal(
        (
          await rows("select public.course_directory($1,$2) v", [
            tenant,
            { q: "General English", status: "inactive" },
          ])
        )[0].v.total,
        1,
      );
      await active("course", english, 4, true);
      await assert.rejects(active("course", english, 4, false), /changed/);
    },
  );
  await t.test(
    "classrooms use real fixed branches, bounded capacities, exact retries and retained inactive history",
    async () => {
      const k = randomUUID();
      firstRoom = await room(branch, {}, null, 0, k);
      assert.equal(await room(branch, {}, null, 0, k), firstRoom);
      secondRoom = await room(second);
      await room(branch, { capacity: "15" }, firstRoom, 1);
      await assert.rejects(
        room(branch, { capacity: "16" }, firstRoom, 1),
        /changed/,
      );
      await assert.rejects(
        room(second, {}, firstRoom, 2),
        /branch cannot change/,
      );
      await active("classroom", firstRoom, 2, false);
      assert.equal((await roomDetail(firstRoom)).classroom.is_active, false);
      assert.equal((await roomDetail(firstRoom)).history.total, 3);
      await active("classroom", firstRoom, 3, true);
      for (const capacity of ["0", "-1", "1.5", "10001"])
        await assert.rejects(
          room(branch, { name: "Bad capacity", capacity }),
          /range|whole/,
        );
    },
  );
  await t.test(
    "tenant-composite category references, foreign resource IDs and unauthenticated subjects are denied",
    async () => {
      await as(2);
      const foreign = (
        await rows("select public.create_business('Catalog B') id")
      )[0].id;
      foreignCategory = (
        await rows(
          "select public.save_course_setting($1,'category',null,$2,0,'Foreign category') id",
          [foreign, randomUUID()],
        )
      )[0].id;
      await assert.rejects(detail(english), /denied/);
      await assert.rejects(roomDetail(firstRoom), /denied/);
      await as(1);
      await assert.rejects(
        course({ category_id: foreignCategory, code: "FOREIGN" }),
        /category/,
      );
      await assert.rejects(
        rows("select public.course_directory($1)", [foreign]),
        /denied/,
      );
      await as(0);
      await assert.rejects(detail(english), /denied/);
      await as(1);
    },
  );
  await t.test(
    "managers and teachers read the shared catalog but branch grants cannot mutate it or expose other rooms/finance",
    async () => {
      await db.exec("reset role");
      for (const [n, role, b] of [
        [3, "manager", branch],
        [4, "teacher", second],
        [5, "employee", branch],
        [6, "admin", branch],
      ]) {
        await rows(
          "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
          [tenant, uid(n), role],
        );
        await rows(
          "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
          [tenant, b, uid(n)],
        );
      }
      await rows(
        "insert into public.business_role_permissions(tenant_id,role_id,permission) select $1,id,'courses.manage' from public.business_roles where tenant_id=$1 and system_key='manager' on conflict do nothing",
        [tenant],
      );
      await as(3);
      assert.equal((await detail(english)).course.id, english);
      await assert.rejects(course(), /Business-wide/);
      assert.equal((await roomDetail(firstRoom)).classroom.branch_id, branch);
      await assert.rejects(roomDetail(secondRoom), /denied/);
      await assert.rejects(room(second, { name: "Forged room" }), /denied/);
      await assert.rejects(room(branch, {}, secondRoom, 1), /denied/);
      await as(4);
      assert.equal((await detail(english)).course.id, english);
      assert.equal((await detail(english)).can_manage, false);
      assert.equal((await roomDetail(secondRoom)).classroom.branch_id, second);
      await assert.rejects(
        room(second, { name: "Teacher unauthorized" }),
        /denied/,
      );
      await assert.rejects(
        rows("select public.financial_report($1,$2)", [tenant, "payments"]),
        /denied/,
      );
      await assert.rejects(
        rows("select * from public.employee_salary_settings"),
        /permission denied/,
      );
      await as(5);
      await assert.rejects(detail(english), /denied/);
      await assert.rejects(roomDetail(firstRoom), /denied/);
      await as(6);
      assert.equal((await detail(english)).can_manage, true);
      await as(1);
    },
  );
  await t.test(
    "inactive branches block new/reactivated rooms while retaining authorized history",
    async () => {
      await active("classroom", secondRoom, 1, false);
      await rows(
        "update public.branches set is_active=false where tenant_id=$1 and id=$2",
        [tenant, second],
      );
      await assert.rejects(
        room(second, { name: "Inactive branch room" }),
        /active branch/,
      );
      await assert.rejects(
        active("classroom", secondRoom, 2, true),
        /Reactivate the branch/,
      );
      assert.equal((await roomDetail(secondRoom)).branch_active, false);
    },
  );
  await t.test(
    "directories search literally, filter/sort and paginate with correct full counts",
    async () => {
      for (let n = 0; n < 22; n++)
        await course({
          name: "Paged course " + String(n).padStart(2, "0"),
          code: "PAGE-" + n,
          standard_price: String(n),
        });
      const r = (
        await rows("select public.course_directory($1,$2,$3) v", [
          tenant,
          { q: "Paged course", sort: "price_desc" },
          1,
        ])
      )[0].v;
      assert.equal(r.total, 22);
      assert.equal(r.rows.length, 2);
      assert.equal(r.rows[0].standard_price, "1.00");
      assert.equal(
        (
          await rows("select public.course_directory($1,$2,3) v", [
            tenant,
            { q: "Paged course" },
          ])
        )[0].v.total,
        22,
      );
      assert.equal(
        (
          await rows("select public.course_directory($1,$2) v", [
            tenant,
            { q: "%" },
          ])
        )[0].v.total,
        0,
      );
      assert.equal(
        (
          await rows("select public.classroom_directory($1,$2) v", [
            tenant,
            { branch, status: "all" },
          ])
        )[0].v.total,
        1,
      );
    },
  );
  await t.test(
    "direct mutations/deletes and audit rewriting are denied, even privileged deletion preserves history",
    async () => {
      await assert.rejects(
        rows("delete from public.courses"),
        /permission denied/,
      );
      await assert.rejects(
        rows("update public.classrooms set capacity=1"),
        /permission denied/,
      );
      await assert.rejects(
        rows("select * from public.academic_configuration_events"),
        /permission denied/,
      );
      await db.exec("reset role");
      await assert.rejects(
        rows("delete from public.courses where id=$1", [english]),
        /retained/,
      );
      await assert.rejects(
        rows("update public.academic_configuration_events set reason='forged'"),
        /immutable/,
      );
      await as(1);
    },
  );
});
