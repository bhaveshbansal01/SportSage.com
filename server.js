var express = require("express");
var fileuploader = require("express-fileupload");
var cloudinary = require("cloudinary").v2;
var mysql2 = require("mysql2");
var bodyParser = require("body-parser");



var app = express();//app() returns an Object:app
app.use(fileuploader());//for receiving files from client and save on server files
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
require('dotenv').config();

//=================================================
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Aiven MySQL connection
//let dbConfig = process.env.AIVEN_MYSQL_URL
//let mySqlVen = mysql2.createPool(dbConfig);
//console.log("AiVen Connected!");
// mySqlVen.connect(function (errKuch) {
//   if (errKuch == null)
//     console.log("AiVen Connected!");
//   else
//     console.log(errKuch.message);
// });
const dbConfig = new URL(process.env.AIVEN_MYSQL_URL);

const mySqlVen = mysql2.createPool({
  host: dbConfig.hostname,
  user: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.pathname.replace('/', ''),
  port: dbConfig.port || 2004,
});


// Home page route
app.get("/", function (req, resp) {
  let path = __dirname + "/public/index.html";
  resp.sendFile(path);
});

// Direct Signup Page (if using separate file)
app.get("/signup", function (req, resp) {
  let path = __dirname + "/public/signup.html";
  resp.sendFile(path);
});

// -------------------- SIGNUP (GET via AJAX) --------------------
app.get("/server-signup-get", function (req, resp) {
  let emailid = req.query.txtEmail;
  let pwd = req.query.txtPwd;
  let userType = req.query.userType;

  mySqlVen.query(
    "INSERT INTO users (emailid, pwd, usertype, regdate) VALUES (?, ?, ?, NOW())",
    [emailid, pwd, userType],
    function (errKuch) {
      if (errKuch == null)
        resp.send("Signup Successfully");
      else
        resp.send(" Error: " + errKuch.message);
    }
  );
});

// Example route for /check-email
app.get("/check-email", (req, res) => {
  const email = req.query.email;
  mySqlVen.query("SELECT * FROM users WHERE emailid = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: true });
    if (results.length > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  });
});


// -------------------- LOGIN (GET via AJAX) --------------------
app.get("/do-login", function (req, resp) {
  let email = req.query.emailid;
  let pwd = req.query.pwd;

  let query = "SELECT * FROM users WHERE emailid = ? AND pwd = ?";
  mySqlVen.query(query, [email, pwd], function (err, allRecords) {
    if (err) {
      console.log(err);
      resp.send({ status: "error" });
    } else if (allRecords.length == 1) {
      let status = allRecords[0].status;
      if (status == 0)
        resp.send({ status: "blocked" });
      else
        resp.send({ status: "success", usertype: allRecords[0].usertype });
    } else {
      resp.send({ status: "invalid" });
    }
  });
});


// -------------------- SAVE NEW ORGANISER --------------------
app.post("/save-organiser", async function (req, res) {
  let certUrl = "";

  if (req.files && req.files.regCert) {
    let fileName = req.files.regCert.name;
    let fullPath = __dirname + "/public/uploads/" + fileName;

    // Move the file to a local folder
    req.files.regCert.mv(fullPath);

    // Upload to Cloudinary
    await cloudinary.uploader.upload(fullPath).then(function (uploadResult) {
      certUrl = uploadResult.secure_url;
      console.log("Cloudinary URL:", certUrl);
    });
  } else {
    certUrl = "nopic.jpg";
  }

  let email = req.body.email;
  let orgName = req.body.orgName;
  let regNum = req.body.regNum;
  let address = req.body.address;
  let city = req.body.city;
  let sports = req.body.sports;
  let website = req.body.website;
  let insta = req.body.insta;
  let head = req.body.head;
  let contact = req.body.contact;
  let otherInfo = req.body.otherInfo;

  let sql = `INSERT INTO organiser_details 
      (email, orgName, regNum, address, city, sports, website, insta, head, contact, regCertUrl, otherInfo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let values = [email, orgName, regNum, address, city, sports, website, insta, head, contact, certUrl, otherInfo];

  mySqlVen.query(sql, values, function (err) {
    if (err == null) {
      res.send("Organiser details saved successfully! 🎉");
    } else {
      res.send("Error: " + err.message);
    }
  });
});


// -------------------- MODIFY EXISTING ORGANISER --------------------
app.post("/modify-organiser", async function (req, res) {
  let certUrl = "";

  if (req.files != null && req.files.regCert) {
    // If user uploaded new registration certificate
    let fileName = req.files.regCert.name;
    let fullPath = __dirname + "/public/uploads/" + fileName;

    await req.files.regCert.mv(fullPath);

    await cloudinary.uploader.upload(fullPath).then(function (uploadResult) {
      certUrl = uploadResult.secure_url;
      console.log("Uploaded New Cert URL:", certUrl);
    });
  } else {
    // No new file uploaded, use existing certificate URL from hidden field
    certUrl = req.body.hdn;
  }

  // Get all other fields from the form
  let email = req.body.email;
  let orgName = req.body.orgName;
  let regNum = req.body.regNum;
  let address = req.body.address;
  let city = req.body.city;
  let sports = req.body.sports;
  let website = req.body.website;
  let insta = req.body.insta;
  let head = req.body.head;
  let contact = req.body.contact;
  let otherInfo = req.body.otherInfo;

  // Prepare update query
  let sql = `UPDATE organiser_details SET 
    orgName=?, regNum=?, address=?, city=?, sports=?, 
    website=?, insta=?, head=?, contact=?, otherInfo=?, regCertUrl=? 
    WHERE email=?`;

  let values = [
    orgName, regNum, address, city, sports,
    website, insta, head, contact, otherInfo, certUrl, email
  ];

  mySqlVen.query(sql, values, function (err, result) {
    if (err == null) {
      if (result.affectedRows == 1) {
        res.send("Organiser record updated successfully! ");
      } else {
        res.send("Invalid Email ID ");
      }
    } else {
      res.send("Error: " + err.message);
    }
  });
});


// -------------------- SEARCH ORGANISER (AJAX GET) --------------------
app.get("/search-organiser", function (req, res) {
  let email = req.query.email;

  const query = "SELECT * FROM organiser_details WHERE email = ?";
  mySqlVen.query(query, [email], function (err, result) {
    if (err) {
      console.log("DB error:", err);
      res.status(500).send("DB error");
    } else {
      res.json(result); // Sends back array of organiser info
    }
  });
});

//====================================================================
app.get("/post-tournament", function (req, resp) {
  let data = req.query;

  mySqlVen.query("SELECT rid FROM organiser_details WHERE email = ?", [data.emailid], function (err1, result1) {

    // Check for DB errors first
    if (err1) {
      console.log("Database error:", err1);
      resp.status(500).send("Server error while fetching organiser.");
      return;
    }

    // Check if organiser is found
    if (!result1 || result1.length === 0) {
      resp.status(404).send("Organiser not found.");
      return;
    }

    let rid = result1[0].rid;

    let query = `
      INSERT INTO tournaments
      (organiser_rid, emailid, eventTitle, date, time, location, city, category, minAge, maxAge, lastDate, fee, prize, contact)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    let values = [
      rid,
      data.emailid,
      data.eventTitle,
      data.date,
      data.time,
      data.location,
      data.city,
      data.category,
      data.minAge,
      data.maxAge,
      data.lastDate,
      data.fee,
      data.prize,
      data.contact
    ];

    mySqlVen.query(query, values, function (err2, result2) {
      if (err2) {
        console.log("Insert Error:", err2);
        resp.status(500).send("Failed to post tournament: " + err2);
      } else {
        resp.send("Tournament posted successfully!");
      }
    });
  });
});






// Delete tournament by rid
app.get("/delete-one-tournament", function (req, resp) {
  let tid = req.query.tid;

  mySqlVen.query("DELETE FROM tournaments WHERE tid = ?", [tid], function (err, result) {
    if (err) resp.send("Error deleting tournament.");
    else if (result.affectedRows === 0) resp.send("Tournament not found.");
    else resp.send("Tournament deleted successfully.");
  });
});



app.get("/fetch-tournaments-by-email", function (req, resp) {
  let email = req.query.email;

  let query = "SELECT * FROM tournaments WHERE emailid = ?";
  mySqlVen.query(query, [email], function (err, result) {
    if (err) {
      console.log("Error fetching tournaments:", err);
      resp.status(500).send("Server error");
    } else {
      resp.send(result);
    }
  });
});

//==========================================================

async function RajeshBansalKaChirag(imgurl)
{
const myprompt = "Read the text on picture and tell all the information in adhaar card and give output STRICTLY in JSON format {adhaar_number:'', name:'', gender:'', dob: ''}. Dont give output as string."   
    const imageResp = await fetch(imgurl)
        .then((response) => response.arrayBuffer());

    const result = await model.generateContent([
        {
            inlineData: {
                data: Buffer.from(imageResp).toString("base64"),
                mimeType: "image/jpeg",
            },
        },
        myprompt,
    ]);
    console.log(result.response.text())
            
            const cleaned = result.response.text().replace(/```json|```/g, '').trim();
            const jsonData = JSON.parse(cleaned);
            console.log(jsonData);

    return jsonData

}

app.post("/submit-player", async function (req, res) {
  let aadhaarUrl = "nopic.jpg";
  let profileUrl = "nopic.jpg";
  let extractedInfo = {
    name: "",
    dob: "",
    gender: ""
  };

  try {
    // ========== Aadhaar Upload & AI OCR ==========
    if (req.files && req.files.aadhaar) {
      const aadhaarFile = req.files.aadhaar;
      const aadhaarPath = __dirname + "/public/uploads/" + aadhaarFile.name;

      await aadhaarFile.mv(aadhaarPath);

      await cloudinary.uploader.upload(aadhaarPath).then(async (uploadResult) => {
        aadhaarUrl = uploadResult.secure_url;
        console.log("Aadhaar URL:", aadhaarUrl);

        try {
          const aiResult = await RajeshBansalKaChirag(aadhaarUrl); // AI OCR

          extractedInfo.name = aiResult.name || "";
          extractedInfo.dob = aiResult.dob || "";
          extractedInfo.gender = aiResult.gender || "";

        } catch (aiErr) {
          console.log("AI Error:", aiErr.message);
          extractedInfo = {
            name: "",
            dob: "",
            gender: "",
            error: "Failed to extract Aadhaar details"
          };
        }
      });
    }

    // ========== Profile Upload ==========
    if (req.files && req.files.profile) {
      const profileFile = req.files.profile;
      const profilePath = __dirname + "/public/uploads/" + profileFile.name;

      await profileFile.mv(profilePath);
      await cloudinary.uploader.upload(profilePath).then((uploadResult) => {
        profileUrl = uploadResult.secure_url;
        console.log("Profile URL:", profileUrl);
      });
    }

    // ========== Collect Form Fields ==========
    const { email, address, contact, game, otherinfo, info, action } = req.body;

    // Use fallback if images not uploaded in modify mode
    if (!req.files?.aadhaar) aadhaarUrl = req.body.hdnAadhaar || aadhaarUrl;
    if (!req.files?.profile) profileUrl = req.body.hdnProfile || profileUrl;

    // ========== Upload Action ==========
    if (action === "upload") {
      const sql = `
        INSERT INTO players 
        (emailid, acardpicurl, profilepicurl, name, dob, gender,address, contact, game, otherinfo, info ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?,?,?,?)`;

      const values = [email, aadhaarUrl, profileUrl,extractedInfo.name, extractedInfo.dob, extractedInfo.gender, address, contact, game, otherinfo, info];

      mySqlVen.query(sql, values, function (err) {
        if (err == null) {
          res.json({
            status: "success",
            message: "Player uploaded successfully!",
            extracted: extractedInfo
          });
        } else {
          res.json({ status: "error", message: err.message });
        }
      });
    }

    // ========== Modify Action ==========
    else if (action === "modify") {
      const sql = `
        UPDATE players SET 
       acardpicurl=?, profilepicurl=?, name=?, dob=?, gender=?, address=?, contact=?, game=?, otherinfo=?, info=? 
        WHERE emailid=?`;

      const values = [ aadhaarUrl, profileUrl, extractedInfo.name, extractedInfo.dob, extractedInfo.gender,address, contact, game, otherinfo, info, email];

      mySqlVen.query(sql, values, function (err, result) {
        if (err == null) {
          if (result.affectedRows === 1) {
            res.json({
              status: "success",
              message: "Player record updated successfully!",
              extracted: extractedInfo
            });
          } else {
            res.json({ status: "fail", message: "Invalid Email ID ❌" });
          }
        } else {
          res.json({ status: "error", message: err.message });
        }
      });
    }

    // ========== Invalid Action ==========
    else {
      res.json({ status: "error", message: "Invalid action" });
    }

  } catch (e) {
    console.log("Unexpected error:", e.message);
    res.json({ status: "error", message: "Something went wrong", details: e.message });
  }
});

//----------------------------------------------------

app.get("/search-player", function (req, res) {
  let email = req.query.email;

  const query = "SELECT * FROM players WHERE emailid = ?";
  mySqlVen.query(query, [email], function (err, result) {
    if (err) {
      console.log("DB error:", err);
      res.status(500).send("DB error");
    } else {
      res.json(result); // Sends back array with player info
    }
  });
});



//=======================================================================

app.get("/do-fetch-all-tournaments",function(req,resp)
{
  console.log(req.query)
        mySqlVen.query("select * from tournaments where city=? and category=?",[req.query.kuchCity,req.query.kuchGame],function(err,allRecords)
        {
          console.log(allRecords)
                    resp.send(allRecords);
        })
})

//===========================================================================

app.get("/fetch-all-users", function (req, res) {
  mySqlVen.query("SELECT * FROM users", function (err, result) {
    if (err) res.status(500).send("DB error");
    else res.send(result);
  });
});

//------------------------------------

app.get("/set-user-status", function (req, res) {
  const emailid = req.query.emailid;
  const status = parseInt(req.query.status); // 1 or 0

  const query = "UPDATE users SET status = ? WHERE emailid = ?";
  mySqlVen.query(query, [status, emailid], function (err, result) {
    if (err) {
      console.log(err);
      res.status(500).send("Database error");
    } else {
      res.send("User status updated to " + (status == 1 ? "Active" : "Blocked"));
    }
  });
});

//================================================================

app.get("/do-fetch-all-players",function(req,resp)
{
        mySqlVen.query("select * from players",function(err,allRecords)
        {
                    resp.send(allRecords);
        })
})                

//======================================================================
app.get("/do-fetch-all-cities",function(req,resp)
{
        mySqlVen.query("select distinct city from tournaments",function(err,allRecords)
        {
                    resp.send(allRecords);
        })
})                

//======================================================================

app.get("/do-fetch-all-oraganizer",function(req,resp)
{
        mySqlVen.query("select * from  organiser_details",function(err,allRecords)
        {
                    resp.send(allRecords);
        })
}) 

//============================================================================

app.get("/update-password", function (req, res) {
  let email = req.query.email;
  let oldPwd = req.query.oldPwd;
  let newPwd = req.query.newPwd;

  let query = "UPDATE users SET pwd=? WHERE emailid=? AND pwd=? AND usertype='player'";
  mySqlVen.query(query, [newPwd, email, oldPwd], function (err, result) {
    if (err) {
      res.status(500).send("Error updating password: " + err);
    } else if (result.affectedRows == 0) {
      res.send("No user found with provided credentials.");
    } else {
      res.send("Password updated successfully!");
    }
  });
});



// -------------------- START SERVER --------------------
app.listen(2004, function () {
  console.log("Server Started at Port no: 2004");
});



