const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 soat
}));

// Ma'lumotlar fayli
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ma'lumotlar papkasini yaratish
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Uploads papkasini yaratish
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Ma'lumotlar faylini yaratish (agar mavjud bo'lmasa)
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// Foydalanuvchilar faylini yaratish (agar mavjud bo'lmasa)
if (!fs.existsSync(USERS_FILE)) {
  // Admin foydalanuvchisini yaratish (username: admin, password: admin123)
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  fs.writeFileSync(USERS_FILE, JSON.stringify([
    { username: 'admin', password: hashedPassword }
  ]));
}

// Ma'lumotlarni o'qish
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ma\'lumotlarni o\'qishda xatolik:', error);
    return [];
  }
}

// Ma'lumotlarni yozish
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Ma\'lumotlarni yozishda xatolik:', error);
  }
}

// Foydalanuvchilarni o'qish
function readUsers() {
  try {
    const users = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(users);
  } catch (error) {
    console.error('Foydalanuvchilarni o\'qishda xatolik:', error);
    return [];
  }
}

// Multer konfiguratsiyasi (fayllarni yuklash uchun)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Admin middleware
function isAdmin(req, res, next) {
  if (req.session.loggedIn && req.session.username === 'admin') {
    next();
  } else {
    res.redirect('/admin');
  }
}

// Bosh sahifa
app.get('/', (req, res) => {
  res.render('index', {
    isLoggedIn: req.session.loggedIn || false,
    username: req.session.username || null
  });
});

// Ma'lumot yuborish (hamma uchun ochiq)
app.post('/submit', upload.fields([
  { name: 'pasport_file', maxCount: 1 },
  { name: 'foto_yuklash', maxCount: 1 }
]), (req, res) => {
  try {
    const { ismi, familiyasi, telefon, yashash_joyi, ishlash_joyi } = req.body;
    
    // Fayllarni tekshirish
    const pasport_file = req.files['pasport_file'] ? req.files['pasport_file'][0].filename : null;
    const foto = req.files['foto_yuklash'] ? req.files['foto_yuklash'][0].filename : null;
    
    console.log("Yuklangan fayllar:", { pasport_file, foto }); // Debug uchun
    
    // Yangi ma'lumot
    const newData = {
      ismi,
      familiyasi,
      telefon,
      yashash_joyi,
      ishlash_joyi,
      timestamp: new Date().toISOString(),
      pasport_file,
      foto
    };
    
    // Ma'lumotlarni saqlash
    const data = readData();
    data.push(newData);
    writeData(data);
    
    // Muvaffaqiyatli xabar bilan bosh sahifaga qaytish
    res.render('success', {
      message: 'Ma\'lumotlar muvaffaqiyatli saqlandi!',
      isLoggedIn: req.session.loggedIn || false,
      username: req.session.username || null
    });
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotlarni saqlashda xatolik yuz berdi.'
    });
  }
});

// Admin login sahifasi
app.get('/admin', (req, res) => {
  // Agar allaqachon login qilingan bo'lsa, ma'lumotlar sahifasiga yo'naltirish
  if (req.session.loggedIn && req.session.username === 'admin') {
    return res.redirect('/data');
  }
  
  // Aks holda login sahifasini ko'rsatish
  res.render('login', { error: null });
});

// Admin login
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  
  const user = users.find(u => u.username === username);
  
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/data');
  } else {
    res.render('login', { error: 'Noto\'g\'ri foydalanuvchi nomi yoki parol' });
  }
});

// Ma'lumotlar ro'yxati (faqat admin uchun)
app.get('/data', isAdmin, (req, res) => {
  const data = readData();
  res.render('view', { 
    data,
    isLoggedIn: req.session.loggedIn || false,
    username: req.session.username || null
  });
});

// Ma'lumotni ko'rish (faqat admin uchun)
app.get('/view/:index', isAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      const item = data[index];
      res.render('item-view', { 
        item,
        isLoggedIn: req.session.loggedIn || false,
        username: req.session.username || null
      });
    } else {
      res.render('error', {
        status: 404,
        message: 'Ma\'lumot topilmadi',
        description: 'Ko\'rish uchun tanlangan ma\'lumot topilmadi.'
      });
    }
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotni ko\'rishda xatolik yuz berdi.'
    });
  }
});

// Ma'lumotni tahrirlash sahifasi (faqat admin uchun)
app.get('/edit/:index', isAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      const item = data[index];
      res.render('item-edit', { 
        item,
        index,
        isLoggedIn: req.session.loggedIn || false,
        username: req.session.username || null
      });
    } else {
      res.render('error', {
        status: 404,
        message: 'Ma\'lumot topilmadi',
        description: 'Tahrirlash uchun tanlangan ma\'lumot topilmadi.'
      });
    }
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotni tahrirlashda xatolik yuz berdi.'
    });
  }
});

// Ma'lumotlarni tahrirlash (faqat admin uchun)
app.post('/update', isAdmin, (req, res) => {
  try {
    const { index, ismi, familiyasi, telefon, yashash_joyi, ishlash_joyi } = req.body;
    
    // Ma'lumotlarni o'qish
    const data = readData();
    
    // Mavjud ma'lumotni yangilash
    if (data[index]) {
      data[index].ismi = ismi;
      data[index].familiyasi = familiyasi;
      data[index].telefon = telefon;
      data[index].yashash_joyi = yashash_joyi;
      data[index].ishlash_joyi = ishlash_joyi;
      
      // Yangilangan ma'lumotlarni saqlash
      writeData(data);
      
      res.redirect('/data?success=Ma\'lumotlar muvaffaqiyatli yangilandi');
    } else {
      res.render('error', {
        status: 404,
        message: 'Ma\'lumot topilmadi',
        description: 'Tahrirlash uchun tanlangan ma\'lumot topilmadi.'
      });
    }
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotlarni yangilashda xatolik yuz berdi.'
    });
  }
});

// Ma'lumotni o'chirish (faqat admin uchun)
app.get('/delete/:index', isAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      // O'chirilgan ma'lumotga tegishli fayllarni o'chirish
      const item = data[index];
      
      if (item.pasport_file) {
        const pasportPath = path.join(__dirname, 'uploads', item.pasport_file);
        if (fs.existsSync(pasportPath)) {
          fs.unlinkSync(pasportPath);
        }
      }
      
      if (item.foto) {
        const fotoPath = path.join(__dirname, 'uploads', item.foto);
        if (fs.existsSync(fotoPath)) {
          fs.unlinkSync(fotoPath);
        }
      }
      
      // Ma'lumotni o'chirish
      data.splice(index, 1);
      writeData(data);
      
      res.redirect('/data?success=Ma\'lumot muvaffaqiyatli o\'chirildi');
    } else {
      res.render('error', {
        status: 404,
        message: 'Ma\'lumot topilmadi',
        description: 'O\'chirish uchun tanlangan ma\'lumot topilmadi.'
      });
    }
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotni o\'chirishda xatolik yuz berdi.'
    });
  }
});

// Ma'lumotlarni CSV formatida yuklab olish
app.get('/download/:index', isAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      const item = data[index];
      
      // CSV fayl yaratish
      const csvContent = `Ism,Familiya,Telefon,Yashash joyi,Ishlash joyi,Sana\n${item.ismi},${item.familiyasi},${item.telefon},${item.yashash_joyi || ''},${item.ishlash_joyi || ''},${new Date(item.timestamp).toLocaleString()}`;
      
      // CSV faylni yuborish
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${item.ismi}_${item.familiyasi}_ma'lumotlari.csv"`);
      res.send(csvContent);
    } else {
      res.render('error', {
        status: 404,
        message: 'Ma\'lumot topilmadi',
        description: 'Yuklab olish uchun tanlangan ma\'lumot topilmadi.'
      });
    }
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotni yuklab olishda xatolik yuz berdi.'
    });
  }
});

// Chiqish
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Xatolik sahifasi
app.use((req, res) => {
  res.status(404).render('error', {
    status: 404,
    message: 'Sahifa topilmadi',
    description: 'Siz so\'ragan sahifa mavjud emas.'
  });
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} portida ishga tushdi`);
});
