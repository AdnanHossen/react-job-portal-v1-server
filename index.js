const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// dedicated middleware for token verify
const logger = (req, res, next) => {
  console.log("inside the logger");
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "token doesn't match" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unAuthorized Access" });
    }
    req.user = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w0hnc79.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // collection

    // Get the database and collection on which to run the operation
    const jobsCollection = client.db("jobPortalDB").collection("jobs");
    const applicationsCollection = client
      .db("jobPortalDB")
      .collection("applications");

    // aut related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      // generate custom jwt
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });

      // set HTTPOnly Cookie
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
        })
        .send({ success: true });
    });

    // read the data
    app.get("/jobs", logger, async (req, res) => {
      console.log("now inside the api");
      const cursor = jobsCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/posted-jobs", async (req, res) => {
      const { hr_email } = req.query;
      const query = {};
      // Filter by hr_email if provided
      if (hr_email) {
        query.hr_email = hr_email;
      }
      // Fetch all fields of matching jobs, excluding _id
      const jobs = await jobsCollection.find(query).toArray();
      res.send(jobs);
      console.log(hr_email);
    });

    app.get("/categories", async (req, res) => {
      const categoryCounts = await jobsCollection
        .aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $project: { category: "$_id", count: 1, _id: 0 } },
        ])
        .toArray();
      res.send(categoryCounts);
    });

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // getting with aggregate and email query
    app.get("/applications", verifyToken, async (req, res) => {
      const { applicantEmail, job_id } = req.query;

      // console.log(`from inside of applications`, req.user);
      // console.log(`from inside of applications`, applicantEmail);
      // console.log(req.user?.user === applicantEmail);
      if (req?.user?.user !== applicantEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const pipeline = [];
      // Filter by applicantEmail if provided
      if (applicantEmail) {
        pipeline.push({ $match: { applicantEmail } });
      }
      // Filter by job_id if provided
      if (job_id) {
        pipeline.push({ $match: { job_id: parseInt(job_id) } });
      }
      // Link with jobs collection
      pipeline.push(
        {
          $lookup: {
            from: "jobs",
            let: { jobIdStr: "$job_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: [{ $toObjectId: "$$jobIdStr" }, "$_id"],
                  },
                },
              },
            ],
            as: "job_info",
          },
        },
        {
          $unwind: {
            path: "$job_info",
            preserveNullAndEmptyArrays: true,
          },
        }
      );
      // Shape the output
      pipeline.push({
        $project: {
          _id: "$_id",
          applicant_email: "$applicantEmail",
          resume_url: "$resumeURL",
          job_found: "$job_info",
        },
      });
      const applications = await applicationsCollection
        .aggregate(pipeline)
        .toArray();
      res.send(applications);
    });

    // create or insert
    app.post("/applications", async (req, res) => {
      // destructure from body
      const { applicantEmail, job_id, linkedin, github, socialMedia } =
        req.body;

      // find the job info through id
      const jobQuery = { _id: new ObjectId(job_id) };
      const job = await jobsCollection.findOne(jobQuery);

      // console.log(job);
      // console.log(applicantEmail, job_id, linkedin, github, socialMedia);

      const application = {
        applicantEmail,
        resumeURL: {
          linkedin,
          github,
          socialMedia,
        },
        job_id,
        company: job.company,
        job_title: job.title,
        location: job.location,
      };
      // console.log(application);

      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Job Portal Server side");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
