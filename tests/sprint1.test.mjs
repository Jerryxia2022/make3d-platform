import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Redis login throttling is optional and customer-only", async () => {
  const loginSource = await readSource("src/app/api/account/login/route.ts");
  const redisSource = await readSource("src/backend/redisLoginThrottle.ts");
  const adminSource = await readSource("src/app/api/admin/login/route.ts");
  const envExample = await readSource(".env.example");
  const productionEnvExample = await readSource(".env.production.example");
  const compose = await readSource("docker-compose.yml");

  assert.match(loginSource, /isRedisLoginThrottleConfigured/);
  assert.match(loginSource, /recordRedisCustomerLoginFailure/);
  assert.match(redisSource, /REDIS_URL/);
  assert.match(redisSource, /make3d:auth:block/);
  assert.match(redisSource, /密码错误次数过多，请10分钟后再试/);
  assert.match(redisSource, /安全系统检测到异常，请24小时后再试/);
  assert.match(redisSource, /当前请求暂不可用/);
  assert.match(envExample, /REDIS_URL=/);
  assert.match(productionEnvExample, /REDIS_URL=/);
  assert.match(compose, /REDIS_URL: \$\{REDIS_URL:-\}/);
  assert.doesNotMatch(adminSource, /redisLoginThrottle/);
});

test("backup script covers SQLite, uploads, and profiles", async () => {
  const script = await readSource("scripts/backup.sh");
  const packageJson = await readSource("package.json");

  assert.match(script, /DATABASE_PATH/);
  assert.match(script, /UPLOADS_DIR/);
  assert.match(script, /PROFILES_DIR/);
  assert.match(script, /sqlite3/);
  assert.match(script, /uploads\.tar\.gz/);
  assert.match(script, /profiles\.tar\.gz/);
  assert.match(packageJson, /"backup": "bash scripts\/backup\.sh"/);
});

test("SEO sitemap, robots, and metadata are configured", async () => {
  const layout = await readSource("src/app/layout.tsx");
  const sitemap = await readSource("src/app/sitemap.ts");
  const robots = await readSource("src/app/robots.ts");

  assert.match(layout, /metadataBase/);
  assert.match(layout, /Make3D 3D打印与小型研发制造服务/);
  assert.match(layout, /SITE_CONFIG\.filingSiteName/);
  assert.match(layout, /openGraph/);
  assert.match(sitemap, /\/quote/);
  assert.match(sitemap, /\/request\/design/);
  assert.match(sitemap, /\/request\/development/);
  assert.match(sitemap, /\/account\/login/);
  assert.match(robots, /disallow: \["\/admin", "\/api"\]/);
  assert.match(robots, /sitemap/);
});
