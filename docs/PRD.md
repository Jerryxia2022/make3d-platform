# Make3D V1.0

在线3D打印报价与接单系统

项目负责人：
Jerry Hsia

创建日期：
2026-06-01
Make3D V1.0
项目背景

目前运营6台Bambu Lab P1S 3D打印机，主要客户来源于：

学生毕业设计
企业产品试制
工业结构件打样

现阶段主要问题：

白天需要正常上班
无法及时回复客户
报价沟通耗费大量时间
客户上传文件后需要人工计算价格

目标是建立一个在线自动接单平台，使客户能够24小时提交需求并获得预估报价。

项目目标

建立一个：

上传模型
↓
自动分析
↓
自动报价
↓
提交订单
↓
后台处理

的在线系统。

重点：

减少沟通成本。

不是完全自动生产。

用户角色
用户类型1

学生用户

需求：

毕业设计打印
单件打印
快速报价

特点：

对价格敏感
STL文件较规范
用户类型2

企业用户

需求：

试制件
功能验证件
小批量生产

特点：

重复下单概率高
单价较高
MVP功能范围
首页

显示：

Make3D

工业级3D打印服务

快速打样
小批量试产
毕业设计打印

上传模型获取报价

按钮：

立即报价
上传页面

支持格式：

STL
3MF
STEP

限制：

单文件最大50MB
材料选择

支持：

PLA

PETG

ABS

后续扩展：

ASA

PETG-CF

PA-CF
参数选择
颜色

数量

备注
STL分析

自动计算：

长

宽

高

体积

估算重量
自动报价

V1公式：

价格 =

材料费
+
设备费
+
人工费

PLA

0.15元/克

PETG

0.25元/克

ABS

0.30元/克

最低消费：

20元

人工处理费：

10元

显示：

预估价格

最终价格以人工确认为准
客户信息

必填：

姓名

电话

微信

选填：

邮箱

公司名称
提交订单

提交后：

保存：

文件

客户信息

报价结果

发送：

管理员邮件通知
后台系统

登录后可查看：

订单列表

字段：

订单编号

提交时间

客户姓名

电话

材料

预估价格

状态
订单状态
待处理

已报价

生产中

已完成

已取消
文件管理

支持：

下载模型

查看客户信息
数据库设计
users

管理员账号

orders

订单主表

字段：

id

order_no

customer_name

phone

wechat

email

company

material

color

quantity

remark

estimated_price

status

created_at
files

上传文件

字段：

id

order_id

filename

filepath

filesize

created_at
技术架构

前端：

Next.js
TypeScript
Tailwind CSS

后端：

Next.js API

数据库：

SQLite

文件：

Local Storage
/uploads

部署：

Docker
Docker Compose

服务器：

Aliyun ECS
2C2G
V2规划

未来增加：

AI客服

自动切片

自动计算打印时间

微信通知

企业微信通知

自动排产

在线支付
不做功能

V1明确不做：

微信支付

支付宝支付

会员系统

积分系统

物流系统

多商户系统
