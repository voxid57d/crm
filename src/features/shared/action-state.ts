export type ActionState = { error?: string; success?: string; link?: string };
export type FormAction = (
  state: ActionState,
  form: FormData,
) => Promise<ActionState>;
