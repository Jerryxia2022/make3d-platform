
# Make3D Database Design

## orders

| 字段 | 类型 | 说明 |
|--------|--------|--------|
| id | INTEGER | 主键 |
| order_no | TEXT | 订单编号 |
| customer_name | TEXT | 客户姓名 |
| phone | TEXT | 电话 |
| wechat | TEXT | 微信 |
| email | TEXT | 邮箱 |
| company | TEXT | 公司 |
| material | TEXT | 材料 |
| quantity | INTEGER | 数量 |
| remark | TEXT | 备注 |
| status | TEXT | 状态 |
| created_at | DATETIME | 创建时间 |

## files

| 字段 | 类型 | 说明 |
|--------|--------|--------|
| id | INTEGER | 主键 |
| order_id | INTEGER | 关联订单 |
| filename | TEXT | 文件名 |
| filepath | TEXT | 文件路径 |
| filesize | INTEGER | 文件大小 |
| created_at | DATETIME | 上传时间 |
