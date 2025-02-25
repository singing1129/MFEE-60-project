import express, { json } from "express";
import multer from "multer";
import moment from "moment";
import cors from "cors";
import { checkToken } from "../../middleware/auth.js";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../../config/mysql.js";
import fetch from 'node-fetch';

dotenv.config();
const upload = multer();
const whiteList = ["http://localhost:3301", "http://localhost:3000"];
const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || whiteList.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("不允許連線"));
    }
  },
};

const router = express.Router();
router.use(cors(corsOptions));
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// 測試 API
router.get("/", (req, res) => {
  res.json({ status: "success", data: null, message: "會員首頁" });
});

// 取得所有使用者
router.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM `users`");
    res.status(200).json({
      status: "success",
      data: rows,
      message: "取得資料成功",
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: err.message || "取得資料失敗",
    });
  }
});

router.put("/users/:id", checkToken, upload.none(), async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) !== req.decoded.id) { 
    return res.status(403).json({
      status: "error",
      message: "沒有修改權限",
    });
  }
  const {
    name,
    password,
    phone,
    birthday,
    address,
    emergency_contact,
    emergency_phone,
  } = req.body;

  try {
    if (id != req.decoded.id) {
      throw new Error("沒有修改權限");
    }

    const updateFields = [];
    const values = [];

    if (name) {
      updateFields.push("`name` = ?");
      values.push(name);
    }
    if (password) {
      updateFields.push("`password` = ?");
      const hashedPassword = await bcrypt.hash(password, 10);
      values.push(hashedPassword);
    }
    if (phone) {
      const phoneRegex = /^09\d{8}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          status: "error",
          message: "手機號碼格式不正確",
        });
      }
      updateFields.push("`phone` = ?");
      values.push(phone);
    }
    if (birthday) {
      updateFields.push("`birthday` = ?");
      values.push(birthday);
    }
    if (address) {
      updateFields.push("`address` = ?");
      values.push(address);
    }
    if (emergency_contact) {
      updateFields.push("`emergency_contact` = ?");
      values.push(emergency_contact);
    }

    if (emergency_phone) {
      updateFields.push("`emergency_phone` = ?");
      values.push(emergency_phone);
    }

    values.push(id);
    const sql = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?;`;
    const [result] = await pool.execute(sql, values);

    if (result.affectedRows == 0) {
      throw new Error("更新失敗");
    }

    res.status(200).json({
      status: "success",
      message: `更新使用者成功: ${email}`,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      status: "error",
      message: err.message ? err.message : "修改失敗",
    });
  }
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const sql = "DELETE FROM `users` WHERE id = ?";
    const [result] = await pool.execute(sql, [id]);

    if (result.affectedRows === 0) throw new Error("刪除失敗，找不到該使用者");

    res.status(200).json({
      status: "success",
      message: `成功刪除使用者 ID: ${id}`,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      status: "error",
      message: err.message || "刪除失敗",
    });
  }
});

router.post("/users/login", upload.none(), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "請提供Email 和密碼" });
  }

  try {
    const sql = "SELECT * FROM `users` WHERE email = ?";
    const [rows] = await pool.execute(sql, [email]);

    if (rows.length == 0) throw new Error("Email 不存在");

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    // console.log(password, user.password);
    // console.log("輸入密碼:", password);
    // console.log("資料庫密碼:", user.password);
    // console.log("比對結果:", isMatch);
    if (!isMatch) throw new Error("帳號或密碼錯誤");

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    res.status(200).json({
      status: "success",
      data: { token },
      message: "登入成功",
    });
  } catch (err) {
    console.log("登入錯誤:", err); // 打印錯誤詳細信息
    res.status(400).json({
      status: "error",
      message: err.message ? err.message : "登入失敗",
    });
  }
});

router.post("/users/logout", checkToken, (req, res) => {
  // const token = jwt.sign(
  //   {
  //     account: "",
  //     mail: "",
  //     head: "",
  //   },
  //   secretKey,
  //   { expiresIn: "-10s" }
  // );
  res.json({
    status: "success",
    // data: { token },
    message: "登出成功",
  });
});

router.post("/users/register", async (req, res) => {
  const { email, password } = req.body;
  const createAt = new Date();

  if (!email || !password) {
    return res.status(400).json({ message: "請提供Email或密碼" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "請提供有效的 Email" });
  }

  try {
    const checkSql = "SELECT * FROM `users` WHERE email = ?";
    const [existingUser] = await pool.execute(checkSql, [email]);
    console.log(existingUser);
    if (existingUser.length > 0) {
      return res
        .status(409)
        .json({ status: "exists", message: "帳號或 Email 已存在" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql =
      "INSERT INTO `users` (`email`, `password`, `created_at`) VALUES (?, ?, ?)";
    const [result] = await pool.execute(sql, [email, hashedPassword, createAt]);

    res.status(201).json({
      message: "註冊成功",
      userId: result.insertId,
    });
  } catch (err) {
    console.error("插入資料時發生錯誤:", err);
    res.status(500).json({ message: "Database error", error: err });
  }
});

router.post("/users/status", checkToken, (req, res) => {
  const { decoded } = req;
  const token = jwt.sign(
    {
      id: decoded.id,
      email: decoded.email, // 改成這裡
      name: decoded.name, 
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );
  res.json({
    status: "success",
    data: { token },
    message: "狀態: 登入中",
  });
});


export { checkToken };
export default router;
