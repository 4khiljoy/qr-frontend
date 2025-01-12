const express = require('express');
const session = require("express-session") ;
const bodyParser = require('body-parser');
const path = require('path');
const QRCode = require('qrcode');
const app = express();
const port = 3001;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Use body-parser to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
    session({
        secret: "5hezw3Ed88VVEJjbNhUVTcZ9uwQOu91J",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000, signed: true },
        store: new session.MemoryStore(),
    })
);

// Serve static files from the "public" directory
app.use(express.static('public'));

// Serve static files for React dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard/build')));

// In-memory database (replace with actual database in production)
const vouchers = [];

// Route for the root URL that redirects to /login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Route for the login page
app.get('/login', (req, res) => {
    res.render('login', { title: 'Login Page', pageHeader: 'Login' });
});

// Route for the create account page
app.get('/create-account', (req, res) => {
    res.render('create-account', { title: 'Create an Account', pageHeader: 'Create an Account' });
});

// Route for the settings page
app.get('/settings', (req, res) => {
    res.render('settings', { title: 'Settings' });
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const session = req.session;
    await prisma.user.findUnique({
        where: {
            username: username
        }
    }).then((user) => {
        if (user && user.password === password) {
            session.username = username;
            session.isLoggedIn = true;
            console.log(session);
            res.redirect('/dashboard'); // Redirect to React dashboard after login
        } else {
            res.render('login', { title: 'Login Page', pageHeader: 'Login', errorMessage: 'Invalid username or password' });
        }
    }).catch((error) => {
        console.error('Error checking user:', error);
        res.render('login', { title: 'Login Page', pageHeader: 'Login', errorMessage: 'An error occurred' });
    })
    console.log(`Username: ${username}, Password: ${password}`);
    
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/login'); // Redirect to login page after logout
    });
})

// Route to handle create account form submission
app.post('/create-account', async(req, res) => {
    const { username, password } = req.body;
    await prisma.user.findUnique({
        where: {
            username: username
        }
    }).then((user) => {
        if (user) {
            res.render('create-account', { title: 'Create an Account', pageHeader: 'Create an Account', errorMessage: 'Username already exists' });
        } else {
            prisma.user.create({
                data: {
                    username: username,
                    password: password,
                }
            }).then(() => {
                console.log('Account created successfully');
                // alert('Account created successfully');
                // res.render('create-account', { title: 'Create an Account', pageHeader: 'Create an Account', successMessage: 'Account created successfully' });
                res.redirect('/login'); // Redirect to React dashboard after account creation
            }).catch((error) => {
                console.error('Error creating account:', error);
                res.render('create-account', { title: 'Create an Account', pageHeader: 'Create an Account', errorMessage: 'An error occurred' });
            })
        }
    }).catch((error) => {
        console.error('Error checking user:', error);
        res.render('create-account', { title: 'Create an Account', pageHeader: 'Create an Account', errorMessage: 'An error occurred' });
    })
    
    
    console.log(`Username: ${username}, Password: ${password}`);
});

// API route to generate QR code and insert voucher into database
app.post('/api/vouchers', async (req, res) => {
    const session = req.session;
    console.log(session);
    const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    try {
        const qrCodeData = await QRCode.toDataURL(randomNumber);
        const generatedDate = new Date().toISOString();
        console.log('QR Code generated successfully');
        console.log('Generated Date:', generatedDate);
        let ExpDate  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const expDate = await prisma.pdf.findFirst({
            where: {
                id : "1"
            }, 
            select: {
                expiredAt: true
            }
        })
        if (expDate) {
            ExpDate = expDate.expiredAt
        }

        await prisma.qrCode.create({
            data: {
                number: randomNumber,
                generatedAt: generatedDate,
                userId: session.username,
                expiredAt: ExpDate
            }
        })

        const expiryDate = ExpDate.toISOString(); // 30 days from now
        vouchers.push({ number: randomNumber, generatedDate, expiryDate });
        res.redirect('/dashboard');
        // res.status(201).json({ qrCode: qrCodeData, successMessage: "QR Code generated and saved successfully!" });
    } catch (error) {
        console.error('Error generating QR Code', error);
        res.status(500).send("QR Code generation error");
    }
});
app.post('/api/settings', async (req, res) => {
    const { title,expiryTime, voucherWidth, voucherHeight, titleFontSize, textFontSize } = req.body;
    console.log(title, expiryTime, voucherWidth, voucherHeight, titleFontSize, textFontSize);
    await prisma.pdf.upsert({
        where: {
            id: "1"
        },
        update: {
            expiredAt: new Date(Date.now() + expiryTime * 24 * 60 * 60 * 1000),
            vwidth: parseInt(voucherWidth),
            vheight: parseInt(voucherHeight),
            nfsize: parseInt(titleFontSize),
            fsize: parseInt(textFontSize),
            title: title
        },
        create: {
            id: "1",
            expiredAt: new Date(Date.now() + expiryTime * 24 * 60 * 60 * 1000),
            vwidth: parseInt(voucherWidth),
            vheight: parseInt(voucherHeight),
            nfsize: parseInt(titleFontSize),
            fsize: parseInt(textFontSize),
            title: title
        }
    })
    res.redirect('/dashboard');
})
// API route to fetch vouchers
app.get('/api/vouchers', async (req, res) => {
    await prisma.qrCode.findMany({
        where: {
            userId: req.session.username
        }
    }).then((vouchers) => {
        console.log(vouchers);
        res.json(vouchers);
    })
    // res.json(vouchers);
});

app.get('/api/pdfsetting', async (req, res) => {
    await prisma.pdf.findUnique({
        where: {
            id: "1"
        }
    }).then((vouchers) => {
        console.log(vouchers);
        res.json(vouchers);
    })
    // res.json(vouchers);
});

// Route to serve the React dashboard
app.get('/dashboard/', (req, res) => {
    res.render('dashboard', { title: 'Dashboard' });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
