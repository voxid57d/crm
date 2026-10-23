import { ActionForm } from "@/components/forms/action-form";
import { logout } from "@/features/auth/actions";

export function AccountMenu({ email }: { email: string | undefined }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:block">
        {email}
      </span>
      <ActionForm
        action={logout}
        submit="Log out"
        className="flex items-center gap-2"
      />
    </div>
  );
}
