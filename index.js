const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

    // read the data
    app.get("/jobs", async (req, res) => {
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
    app.get("/applications", async (req, res) => {
      const { applicantEmail, job_id } = req.query;
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
