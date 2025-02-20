import express from "express";
import multer from "multer";
import { pool } from "../../config/mysql.js";

const router = express.Router();

// 初始化 multer 用于处理图片上传
const upload = multer({ dest: "uploads/" });

// 1️⃣ 获取新建文章所需数据：分类和标签
router.get("/", async (req, res) => {
  try {
    // 获取所有大分类
    const [bigCategories] = await pool.execute(`
      SELECT id, name FROM article_category_big
    `);

    // 获取所有标签
    const [tags] = await pool.execute(`
      SELECT tag_name FROM article_tag_small
    `);

    res.json({
      status: "success",
      data: {
        bigCategories,
        tags: tags.map(tag => tag.tag_name),
      },
    });
  } catch (error) {
    console.error("❌ 获取新建文章所需数据失败：", error);
    res.status(500).json({
      status: "error",
      message: "获取新建文章所需数据失败",
    });
  }
});

// 2️⃣ 提交新文章
router.post("/", upload.single("cover_image"), async (req, res) => {
  const { title, content, article_category_small_id, users_id, tags } = req.body;
  const coverImage = req.file;

  try {
    // 插入文章
    const [articleResult] = await pool.execute(
      `
      INSERT INTO article (title, content, article_category_small_id, users_id)
      VALUES (?, ?, ?, ?)
      `,
      [title, content, article_category_small_id, users_id]
    );

    const articleId = articleResult.insertId;

    // 处理封面图片
    if (coverImage) {
      await pool.execute(
        `
        INSERT INTO article_image (article_id, img_url, is_main)
        VALUES (?, ?, TRUE)
        `,
        [articleId, `/uploads/${coverImage.filename}`]
      );
    }

    // 处理标签
    const tagList = JSON.parse(tags);
    for (const tagName of tagList) {
      // 检查标签是否存在
      const [tagResult] = await pool.execute(
        `
        SELECT id FROM article_tag_small WHERE tag_name = ?
        `,
        [tagName]
      );

      let tagId;
      if (tagResult.length === 0) {
        // 如果标签不存在，则创建新标签
        const [newTagResult] = await pool.execute(
          `
          INSERT INTO article_tag_small (tag_name)
          VALUES (?)
          `,
          [tagName]
        );
        tagId = newTagResult.insertId;
      } else {
        tagId = tagResult[0].id;
      }

      // 将标签与文章关联
      await pool.execute(
        `
        INSERT INTO article_tag_big (article_id, article_tag_small_id)
        VALUES (?, ?)
        `,
        [articleId, tagId]
      );
    }

    res.json({
      status: "success",
      articleId,
    });
  } catch (error) {
    console.error("❌ 创建文章失败：", error);
    res.status(500).json({
      status: "error",
      message: "创建文章失败",
    });
  }
});

export default router;
