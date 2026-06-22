const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const cors = require("cors");
const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("medicare");

    const doctorCollections = db.collection("doctors");
    const doctorScheduleCollections = db.collection("doctorSchedule");


    //getting all doctors added schedules for find-doctors page--

    app.get('/api/all-schedules', async(req,res)=>{
      const result = await doctorScheduleCollections.find().toArray()
      res.send(result)
    })
    // get single schedule for details page
    app.get('/api/single-schedule', async(req,res)=>{
      
      const scheduleId = req.query.scheduleId

      const result = await doctorScheduleCollections.findOne({
        _id: new ObjectId(scheduleId)
      })
      res.send(result)
    })
    // doctors profile or doctorCollections create or update

    app.patch("/api/doctors/:doctorId", async (req, res) => {
      try {
        const doctorId = req.params.doctorId;
        const doctorData = req.body;

        const filter = {
          doctorId,
        };

        const updateDoc = {
          $set: {
            ...doctorData,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
            status: 'Pending'
          },
        };

        const options = {
          upsert: true,
        };

        const result = await doctorCollections.updateOne(
          filter,
          updateDoc,
          options,
        );

        res.status(200).send({
          success: true,
          message: "Doctor profile saved successfully",
          result,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Something went wrong",
        });
      }
    });

    //for doctor data by doctorId - use to submit schedule with details--

    app.get('/api/my/doctor', async(req,res)=>{
        const query = {}
        if(req.query.doctorId){
            query.doctorId = req.query.doctorId
        }
        const result = await doctorCollections.findOne(query)
        res.send(result)
    })


    // adding schedule from schedule dashboard page

    app.post("/api/doctor-schedule", async (req, res) => {
      const data = req.body;
      const result = await doctorScheduleCollections.insertOne(data)
      res.send(result)
    });


    //getting all schedule of logged in doctor-- in schedule page
    app.get('/api/doctor-schedule', async(req,res)=>{
        const query = {}
        if(req.query.doctorId){
            query.doctorId = req.query.doctorId
        }

        const result = await doctorScheduleCollections.find(query).toArray()
        res.send(result)
    })








    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
