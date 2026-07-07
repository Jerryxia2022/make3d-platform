import { openDatabase } from "../src/backend/database.ts";
import { reconcileWechatPayments } from "../src/backend/wechatPayService.ts";

const db = openDatabase();

try {
  const results = await reconcileWechatPayments(db);
  console.log(
    JSON.stringify(
      {
        checked: results.length,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
