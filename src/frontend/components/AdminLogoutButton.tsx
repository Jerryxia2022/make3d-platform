export function AdminLogoutButton() {
  return (
    <form action="/api/admin/logout" method="post">
      <button className="font-semibold text-graphite" type="submit">
        退出登录
      </button>
    </form>
  );
}
