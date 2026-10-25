import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./database.mjs";
export async function portableAttendanceFixture(t, options = {}) {
  const db = await createTestDatabase(options);
  t.after(() => db.close());
  const rows = async (q, a = []) => (await db.query(q, a)).rows,
    value = async (q, a = []) => (await rows(q, a))[0].v;
  const uid = (n) => `94000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
      `attendance${n}@example.test`,
    ]);
  await as(1);
  const tenant = await value("select public.create_business('Attendance A') v"),
    branch = (await rows("select id from public.branches"))[0].id,
    second = await value(
      "insert into public.branches(tenant_id,name) values($1,'Other attendance branch') returning id v",
      [tenant],
    );
  const day = (n) =>
    value(
      "select ((now() at time zone 'Asia/Tashkent')::date+$1::integer)::text v",
      [n],
    );
  const today = await day(0),
    start = await day(-30);
  await db.exec("reset role");
  for (const [n, key, bs] of [
    [2, "teacher", [branch]],
    [3, "manager", [branch]],
    [4, "employee", [branch]],
    [6, "teacher", [branch, second]],
    [7, "teacher", [branch]],
  ]) {
    await rows(
      "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
      [tenant, uid(n), key],
    );
    for (const b of bs)
      await rows(
        "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
        [tenant, b, uid(n)],
      );
  }
  await as(1);
  const employee = async (n, bs) => {
    const id = await value(
      "select public.save_employee($1,null,$2,'',$3,'Teacher','active',$4,'',$5) v",
      [
        tenant,
        `Attendance teacher ${n}`,
        `attendance${n}@example.test`,
        start,
        bs,
      ],
    );
    await db.exec("reset role");
    await rows("update public.employees set user_id=$1 where id=$2", [
      uid(n),
      id,
    ]);
    await as(1);
    return id;
  };
  const teacher = await employee(2, [branch]),
    other = await employee(6, [branch, second]),
    sub = await employee(7, [branch]);
  const course = await value("select public.save_course($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    {
      name: "Attendance course",
      standard_price: "750000.10",
      pricing_model: "monthly",
    },
  ]);
  const group = async (name, b, e) => {
    const g = await value("select public.save_study_group($1,null,$2,0,$3) v", [
      tenant,
      randomUUID(),
      {
        name,
        branch_id: b,
        course_id: course,
        start_date: start,
        capacity: "50",
      },
    ]);
    await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
      tenant,
      g,
      randomUUID(),
      [e],
      e,
    ]);
    await rows(
      "select public.change_group_status($1,$2,$3,2,'active','Start attendance teaching')",
      [tenant, g, randomUUID()],
    );
    return g;
  };
  const g1 = await group("Main group", branch, teacher),
    g2 = await group("Colleague group", branch, other),
    g3 = await group("Restricted branch group", second, other);
  const student = async (name) =>
    value("select public.save_student($1,$2,null,$3,'{}',$4) v", [
      tenant,
      randomUUID(),
      { first_name: name, phone: "99890" + Math.floor(Math.random() * 1e7) },
      [branch],
    ]);
  const pupil = await student("Original attendance student"),
    late = await student("Joined later"),
    pending = await student("Pending student"),
    paused = await student("Paused student");
  const enroll = async (s, date = start, status = "active", g = g1) =>
    value("select public.create_student_enrollment($1,$2,$3,$4,$5) v", [
      tenant,
      g,
      s,
      randomUUID(),
      {
        enrollment_date: today,
        effective_start_date: date,
        status,
        agreed_price: "750000.10",
        pricing_model: "monthly",
        notes: "Private tuition contract",
      },
    ]);
  const enrollment = await enroll(pupil),
    lateEnrollment = await enroll(late, await day(-2)),
    pendingEnrollment = await enroll(pending, start, "pending"),
    pausedEnrollment = await enroll(paused);
  await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
    tenant,
    pausedEnrollment,
    randomUUID(),
    {
      status: "paused",
      effective_start_date: start,
      reason: "Pause from recorded instant",
    },
  ]);
  const lesson = async (n, g = g1, e = teacher, extra = {}) =>
    value(
      "select public.save_lesson($1,$2,null,$3,0,$4,'Attendance lesson fixture') v",
      [
        tenant,
        g,
        randomUUID(),
        {
          local_start: (await day(n)) + "T10:00",
          local_end: (await day(n)) + "T11:00",
          timezone: "Asia/Tashkent",
          teacher_id: e,
          title: "Attendance lesson",
          ...extra,
        },
      ],
    );
  const old = await lesson(-5),
    recent = await lesson(-1),
    future = await lesson(5),
    subLesson = await lesson(-2, g1, teacher, { substitute_id: sub }),
    empty = await lesson(-1, g2, other),
    restricted = await lesson(-4, g3, other),
    cancelled = await lesson(-3);
  await rows(
    "select public.transition_lesson($1,$2,$3,1,'cancelled','Cancelled fixture')",
    [tenant, cancelled, randomUUID()],
  );
  const detail = (l = old, p = 0, h = 0) =>
    value("select public.attendance_sheet_details($1,$2,$3,$4) v", [
      tenant,
      l,
      p,
      h,
    ]);
  const prepare = (l = old, key = randomUUID()) =>
    value("select public.prepare_attendance_sheet($1,$2,$3) v", [
      tenant,
      l,
      key,
    ]);
  const save = (
    l,
    v,
    marks,
    correct = false,
    reason = "",
    key = randomUUID(),
  ) =>
    value("select public.save_attendance_marks($1,$2,$3,$4,$5,$6,$7) v", [
      tenant,
      l,
      key,
      v,
      marks,
      correct,
      reason,
    ]);
  const finalize = (l, v, empty = false, key = randomUUID()) =>
    value("select public.finalize_attendance_sheet($1,$2,$3,$4,$5) v", [
      tenant,
      l,
      key,
      v,
      empty,
    ]);
  const refresh = (l, v) =>
    value("select public.refresh_attendance_roster($1,$2,$3,$4) v", [
      tenant,
      l,
      randomUUID(),
      v,
    ]);
  const workspace = async (f = {}, p = 0) =>
    value("select public.attendance_lesson_directory($1,$2,$3) v", [
      tenant,
      { from: await day(-30), to: await day(30), view: "all", ...f },
      p,
    ]);
  const history = (f = {}, p = 0) =>
    value("select public.attendance_record_directory($1,$2,$3) v", [
      tenant,
      { from: start, to: today, ...f },
      p,
    ]);

  return {
    db,
    rows,
    value,
    uid,
    as,
    tenant,
    branch,
    second,
    day,
    today,
    start,
    employee,
    teacher,
    other,
    sub,
    course,
    group,
    g1,
    g2,
    g3,
    student,
    pupil,
    late,
    pending,
    paused,
    enroll,
    enrollment,
    lateEnrollment,
    pendingEnrollment,
    pausedEnrollment,
    lesson,
    old,
    recent,
    future,
    subLesson,
    empty,
    restricted,
    cancelled,
    detail,
    prepare,
    save,
    finalize,
    refresh,
    workspace,
    history,
  };
}
