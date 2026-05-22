// ============================================================
//  server.js — Aroma Cafe | Express + MongoDB + ImageKit
// ============================================================
require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const ImageKit = require('imagekit');

const app  = express();
const PORT = process.env.PORT || 3001;

// ============================================================
//  ImageKit
// ============================================================
const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// ============================================================
//  Multer — memory storage (صور تروح ImageKit)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },  // 5MB
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('الملف يجب أن يكون صورة'));
  },
});

// ============================================================
//  Middleware
// ============================================================
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  Security helpers
// ============================================================
// Strip any HTML/script tags from string fields
function sanitize(str, maxLen = 500) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')     // strip HTML tags
    .replace(/javascript:/gi, '') // strip js: protocol
    .replace(/on\w+\s*=/gi, '')   // strip event handlers
    .trim()
    .slice(0, maxLen);
}

// ============================================================
//  MongoDB
// ============================================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aroma_cafe')
  .then(() => console.log('✅ MongoDB متصل'))
  .catch(err => console.error('❌ MongoDB خطأ:', err));

// ============================================================
//  Schemas & Models
// ============================================================
const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role:     { type: String, default: 'admin' },
});

const categorySchema = new mongoose.Schema({
  key:      { type: String, required: true, unique: true },
  label:    { type: String, required: true },
  icon:     { type: String, default: '☕' },
  subtitle: { type: String, default: '' },
  order:    { type: Number, default: 0 },
});

const itemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  price:       { type: String, required: true },
  description: { type: String, default: '' },
  image:       { type: String, default: '' },   // ImageKit URL
  fileId:      { type: String, default: '' },   // ImageKit fileId للحذف
  category:    { type: String, required: true },
  order:       { type: Number, default: 0 },    // ✅ ترتيب العنصر داخل القسم
}, { timestamps: true });

const User     = mongoose.model('User',     userSchema);
const Category = mongoose.model('Category', categorySchema);
const Item     = mongoose.model('Item',     itemSchema);

// ============================================================
//  Helper — حذف صورة من ImageKit بأمان
// ============================================================
async function deleteFromImageKit(fileId) {
  if (!fileId) return;
  try {
    await imagekit.deleteFile(fileId);
    console.log('✅ حُذفت الصورة من ImageKit:', fileId);
  } catch (err) {
    console.warn('⚠️ تعذّر حذف الصورة من ImageKit:', err.message);
  }
}

// ============================================================
//  Seed — يعمل مرة واحدة عند أول تشغيل
// ============================================================
async function seedDatabase() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Aroma41788', 12);
    await User.create({
      email:    process.env.ADMIN_EMAIL || 'aboodmax788@gmail.com',
      password: hashed,
      role:     'admin',
    });
    console.log('✅ تم إنشاء حساب الأدمن');
  }
  const catCount = await Category.countDocuments();
  if (catCount > 0) return;

  await Category.insertMany([
    { key:'hot_coffee',  label:'القهوة الساخنة',  icon:'☕', subtitle:'قهوة طازجة محضّرة بأجود حبوب الأرابيكا' },
    { key:'cold_coffee', label:'القهوة الباردة',   icon:'🧊', subtitle:'مشروبات قهوة مثلجة لتبريد يومك' },
    { key:'ice_tea',     label:'آيس تي',            icon:'🍵', subtitle:'شاي مثلج بنكهات منعشة ومتنوعة' },
    { key:'mojito',      label:'موهيتو',             icon:'🍃', subtitle:'موهيتو طازج بالنعناع والليمون المنعش' },
    { key:'milkshake',   label:'ميلك شيك',          icon:'🥤', subtitle:'ميلك شيك كريمي بنكهات لا تُقاوم' },
    { key:'mocktail',    label:'موكتيل',             icon:'🍹', subtitle:'مشروبات فاخرة بألوان وطعم استثنائي' },
    { key:'juices',      label:'عصاير',              icon:'🍊', subtitle:'عصاير طبيعية طازجة معصورة أمامك' },
    { key:'desserts',    label:'الحلويات',           icon:'🍰', subtitle:'حلويات فاخرة تُكمل تجربتك معنا' },
  ]);
  console.log('✅ تم زرع الأقسام');
}

mongoose.connection.once('open', seedDatabase);

// ============================================================
//  Auth Middleware
// ============================================================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'aroma_secret_2026');
    next();
  } catch {
    res.status(401).json({ error: 'الجلسة منتهية — يرجى تسجيل الدخول مجدداً' });
  }
}

// ============================================================
//  Auth Routes
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const email    = sanitize(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '').slice(0, 200);

    if (!email || !password)
      return res.status(400).json({ error: 'يرجى إدخال الإيميل وكلمة السر' });

    // Basic email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'صيغة الإيميل غير صحيحة' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'الإيميل أو كلمة السر غير صحيحة' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'الإيميل أو كلمة السر غير صحيحة' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'aroma_secret_2026',
      { expiresIn: '24h' }
    );

    res.json({ token, email: user.email, role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============================================================
//  Upload Route — يستقبل صورة WebP مضغوطة من المتصفح
// ============================================================
app.post('/api/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });

    // الصورة وصلت WebP مضغوطة من المتصفح
    const ext      = req.file.mimetype === 'image/webp' ? 'webp' : req.file.originalname.split('.').pop().replace(/[^a-z0-9]/gi,'');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const result = await imagekit.upload({
      file:     req.file.buffer.toString('base64'),
      fileName: fileName,
      folder:   '/menu/',
    });

    res.json({ url: result.url, fileId: result.fileId });
  } catch (e) {
    res.status(500).json({ error: 'فشل رفع الصورة: ' + e.message });
  }
});

// ============================================================
//  Categories Routes
// ============================================================
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find().sort({ order: 1 });
    const obj  = {};
    cats.forEach(c => { obj[c.key] = { label: c.label, icon: c.icon, subtitle: c.subtitle, order: c.order }; });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', authMiddleware, async (req, res) => {
  try {
    const key = sanitize(req.body.key, 50).replace(/[^a-z0-9_]/gi, '');
    if (!key) return res.status(400).json({ error: 'مفتاح القسم غير صالح' });
    // Assign order = last + 1
    const lastCat = await Category.findOne().sort({ order: -1 });
    const order   = lastCat ? (lastCat.order + 1) : 0;
    const cat = await Category.create({
      key,
      label:    sanitize(req.body.label, 60),
      icon:     sanitize(req.body.icon, 10),
      subtitle: sanitize(req.body.subtitle, 150),
      order,
    });
    res.status(201).json(cat);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/categories/:key', authMiddleware, async (req, res) => {
  try {
    const update = {
      label:    sanitize(req.body.label, 60),
      icon:     sanitize(req.body.icon, 10),
      subtitle: sanitize(req.body.subtitle, 150),
    };
    if (req.body.order !== undefined) update.order = Number(req.body.order);
    const cat = await Category.findOneAndUpdate({ key: req.params.key }, update, { new: true });
    if (!cat) return res.status(404).json({ error: 'القسم غير موجود' });
    res.json(cat);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Bulk reorder categories
app.post('/api/categories/reorder', authMiddleware, async (req, res) => {
  try {
    const { order } = req.body; // array of { key, order }
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'بيانات الترتيب غير صالحة' });
    }
    
    // Update each category with new order
    for (const item of order) {
      if (!item.key || item.order === undefined) continue;
      await Category.findOneAndUpdate(
        { key: item.key },
        { order: Number(item.order) }
      );
    }
    
    res.json({ message: 'تم حفظ ترتيب الأقسام بنجاح', success: true });
  } catch (e) {
    console.error('Reorder categories error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Bulk reorder items within a category
app.post('/api/items/reorder', authMiddleware, async (req, res) => {
  try {
    const { order } = req.body; // array of { id, order }
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'بيانات الترتيب غير صالحة' });
    }
    
    // Update each item with new order
    for (const item of order) {
      if (!item.id || item.order === undefined) continue;
      await Item.findByIdAndUpdate(item.id, { order: Number(item.order) });
    }
    
    res.json({ message: 'تم حفظ ترتيب العناصر بنجاح', success: true });
  } catch (e) {
    console.error('Reorder items error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/categories/:key', authMiddleware, async (req, res) => {
  try {
    await Category.findOneAndDelete({ key: req.params.key });
    const items = await Item.find({ category: req.params.key });
    await Promise.all(items.map(i => deleteFromImageKit(i.fileId)));
    await Item.deleteMany({ category: req.params.key });
    res.json({ message: 'تم الحذف' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
//  Items Routes
// ============================================================

// GET — مرتّبة حسب order
app.get('/api/items', async (req, res) => {
  try {
    const filter = req.query.category ? { category: req.query.category } : {};
    const items  = await Item.find(filter).sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — إضافة عنصر جديد
app.post('/api/items', authMiddleware, async (req, res) => {
  try {
    const { category, image, fileId } = req.body;
    const name  = sanitize(req.body.name, 100);
    const price = sanitize(req.body.price, 20);
    const desc  = sanitize(req.body.description, 300);

    if (!name || !price || !category)
      return res.status(400).json({ error: 'الاسم والسعر والقسم مطلوبة' });

    // Assign order = last in category + 1
    const lastItem = await Item.findOne({ category }).sort({ order: -1 });
    const order    = lastItem ? (lastItem.order + 1) : 0;

    const item = await Item.create({ name, price, description: desc, image, fileId: fileId||'', category, order });
    res.status(201).json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT — تعديل عنصر (يدعم تحديث order وحده أو مع باقي الحقول)
app.put('/api/items/:id', authMiddleware, async (req, res) => {
  try {
    const oldItem = await Item.findById(req.params.id);
    if (!oldItem) return res.status(404).json({ error: 'العنصر غير موجود' });

    const update = {};

    // Only update fields that were sent
    if (req.body.name        !== undefined) update.name        = sanitize(req.body.name, 100);
    if (req.body.price       !== undefined) update.price       = sanitize(req.body.price, 20);
    if (req.body.description !== undefined) update.description = sanitize(req.body.description, 300);
    if (req.body.category    !== undefined) update.category    = sanitize(req.body.category, 50);
    if (req.body.order       !== undefined) update.order       = Number(req.body.order);

    // Handle image change — delete old from ImageKit
    if (req.body.image !== undefined) {
      update.image = req.body.image;
      const newFileId = req.body.fileId;
      if (newFileId && oldItem.fileId && newFileId !== oldItem.fileId) {
        await deleteFromImageKit(oldItem.fileId);
      }
      if (newFileId !== undefined) update.fileId = newFileId;
    }

    const updated = await Item.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE — حذف عنصر + صورته
app.delete('/api/items/:id', authMiddleware, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود' });
    await deleteFromImageKit(item.fileId);
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف العنصر والصورة بنجاح' });
  } catch (e) { res.status(500).json({ error: 'حدث خطأ: ' + e.message }); }
});

// ============================================================
//  Full Menu — public, مرتّب حسب order
// ============================================================
app.get('/api/menu', async (req, res) => {
  try {
    const cats  = await Category.find().sort({ order: 1 });
    const items = await Item.find().sort({ order: 1, createdAt: 1 });
    // categoriesArr: array مرتبة بـ order — هذا ما يستخدمه app.js لضمان الترتيب الصحيح
    const categoriesArr = cats.map(c => ({
      key: c.key, label: c.label, icon: c.icon, subtitle: c.subtitle, order: c.order,
    }));
    // categories: object للتوافق مع الكود القديم
    const catObj = {};
    cats.forEach(c => { catObj[c.key] = { label: c.label, icon: c.icon, subtitle: c.subtitle, order: c.order }; });
    res.json({
      cafe:          { name: 'Dark Cafe', subtitle: '', logo: '' },
      categories:    catObj,
      categoriesArr: categoriesArr,
      items: items.map(i => ({
        id:          i._id,
        name:        i.name,
        price:       i.price,
        description: i.description,
        image:       i.image,
        category:    i.category,
        order:       i.order,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
//  Stats
// ============================================================
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const totalItems = await Item.countDocuments();
    const totalCats  = await Category.countDocuments();
    const byCat      = await Item.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
    res.json({ totalItems, totalCats, byCat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// ============================================================
//  Start
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});