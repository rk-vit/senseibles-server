import express from "express";
import cors from "cors"
import bodyParser from "body-parser";
import {dirname} from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy } from "passport-local";
import session  from "express-session";
import dotenv from "dotenv"
const app = express();
const saltRounds = 10;
const db = new pg.Client({
    user:"postgres",
    host:"localhost",
    database:"Noter",
    password:"rk@vit",
    port:5432
  })
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
db.connect((err) => {
  if (err) {
    console.error("Connection error:", err.stack);
  } else {
    console.log("Connected to the database");
  }
});


app.set("trust proxy",1);
app.use(
    session({
      secret: "TOPSECRET",
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: true,  // Ensure secure cookies in production (HTTPS)
        sameSite: "None", // Allow cross-site cookies for frontend and backend hosted on different domains
        httpOnly: true,   // Prevent client-side JS from accessing cookies (for security)
        maxAge: 24 * 60 * 60 * 1000, // Optional: Set expiration time for the session cookie
      },
    })
  );

app.use(passport.initialize());
app.use(passport.session());
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(__dirname+'/public'))
app.use(cors({
    origin: ['http://localhost:5173', 'https://noterapp.vercel.app','http://localhost:5174'],
    credentials: true,

}));
app.use(bodyParser.urlencoded({extended:true}))
app.use(express.json());
const port = 3000;


// auth Logic
app.get('/auth/protect', (req, res) => {
    console.log("User details",req.user);
    console.log("Authenticated: ", req.isAuthenticated());  // Log the authentication status
    if (req.isAuthenticated()) {
      res.status(200).json({ authenticated: true, user: req.user });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });
  

app.post("/login", (req, res, next) => {
    console.log("login requested");
    passport.authenticate("local", (err, user, info) => {
        console.log(user);
        if (err) {
            console.error("Authentication Error:", err);
            return res.sendStatus(500);
        }
        if (!user) {
            console.log("Authentication Failed: User not found");
            return res.sendStatus(401);
        }
        req.login(user, (error) => {
            if (error) {
                console.error("Login Error:", error);
                return  res.sendStatus(500);
            } else {
                // Send a successful response after setting the cookie
                res.sendStatus(200);
                console.log("Login Successful");
            }
        });
    })(req, res, next); // Pass req, res, and next to allow proper flow
});

//encrypted registeration
app.post("/register",async(req,res)=>{
    console.log("User info :- ",req.body);
    const user = req.body.user;
    const name = req.body.name;
    const pass = req.body.pass;
    bcrypt.hash(pass,saltRounds, async(err,hash)=>{
        if(err){
            console.log("Error Hashing the password:-",err);
        }
        else{
            console.log("hashed pass :- ",hash);
            try{
                const result = await db.query("INSERT INTO users(username,password,name) values($1,$2,$3) RETURNING * " ,[user,hash,name]);
                res.sendStatus(201)
            }catch(error){
                console.log("Error registering in db:- "+error);
            }
        }
    })
})


passport.use(new Strategy(async (username, password, cb) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE username=$1", [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHash = user.password;
            
            console.log("User found, comparing passwords...");

            bcrypt.compare(password, storedHash, (err, compResult) => {
                if (err) {
                    console.error("Error comparing passwords:", err);
                    return cb(err); // Pass error to callback
                }

                if (compResult) {
                    console.log("Password match successful");
                    return cb(null, user); // Authentication successful
                } else {
                    console.log("Password mismatch");
                    return cb(null, false); // Password doesn't match
                }
            });
        } else {
            console.log("User not found");
            return cb(null, false); // No user found
        }
    } catch (err) {
        console.error("Error in database query:", err);
        return cb(err); // Return the database query error
    }
}));


passport.serializeUser((user,cb)=>{
    console.log("Serializing: "+user.username+" "+user.password);
    cb(null,user);
})

passport.deserializeUser((user,cb)=>{
    console.log("DeSerializing"+user);
    cb(null,user);
})

// auth logic


//app logic

app.get("/adm-events",async(req,res)=>{
    try{
        const result = await db.query("SELECT * FROM EVENTS");
        console.log(result.rows);
        res.json(result.rows);
    }catch(err){
        console.log(err);
    }
})

app.post("/adm-events", async (req, res) => {
    const event_name = req.body.e_name;
    const event_description = req.body.e_des;
    const event_date = req.body.e_date;
    const event_time = req.body.e_time;
    const event_location = req.body.e_loc;  
    const event_image_url = req.body.e_img;

    try {
        // Query to insert the event details into the database
        const result = await db.query(
            `INSERT INTO events (event_name, event_description, event_date, event_time, event_location, event_image_url) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [event_name, event_description, event_date, event_time, event_location, event_image_url]
        );

        // Respond with success and inserted event details
        res.status(201).json({
            message: "Event added successfully!",
            event: result.rows[0],
        });
    } catch (err) {
        console.error("Error inserting event:", err);
        res.status(500).json({
            message: "Failed to add the event. Please try again later.",
            error: err.message,
        });
    }
});

app.get("/adm-events/:id", async (req, res) => {
    const { id } = req.params; // Extract the event ID from the URL
  
    try {
      // Fetch event details by ID from the database
      const result = await db.query("SELECT * FROM EVENTS WHERE event_id = $1", [id]);
  
      if (result.rows.length === 0) {
        return res.status(404).send("Event not found");
      }
  
      console.log(result.rows);
      res.json(result.rows[0]); // Send the single event details as a response
    } catch (err) {
      console.log(err);
      res.status(500).send("Error fetching event details");
    }
  });

  app.patch("/adm-events/:id",async(req,res)=>{
    const event_id = req.params.id;
    const event_name = req.body.e_name;
    const event_description = req.body.e_des;
    const event_date = req.body.e_date;
    const event_time = req.body.e_time;
    const event_location = req.body.e_loc;  
    const event_image_url = req.body.e_img;
    console.log(req.body.e_name);
    console.log(req.params.id);
    try{
        const result = await db.query(
            "UPDATE EVENTS SET event_name = $1, event_description = $2, event_date = $3, event_time = $4, event_location = $5, event_image_url = $6 WHERE event_id = $7",
            [event_name, event_description, event_date, event_time, event_location, event_image_url, event_id]
          );
        res.sendStatus(200)
    }catch(err){
        console.log("Error in updating events:-",err);
    }
  })
  app.delete("/adm-events/:id", async (req, res) => {
    const { id } = req.params; // Get event ID from URL parameter
    console.log("Delete requested for ID:", id);

    try {
        const result = await db.query("DELETE FROM EVENTS WHERE event_id = $1 RETURNING *", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({ message: "Event deleted successfully" });
    } catch (err) {
        console.error("Error deleting event:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.listen(port,(req,res)=>{
    console.log(`server running in port ${port}`)
})