const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const cors = require("cors");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};

async function run() {
  try {
    // await client.connect();
    const db = client.db("medicare");

    const doctorCollections = db.collection("doctors");
    const doctorScheduleCollections = db.collection("doctorSchedule");
    const appointmentCollections = db.collection("appointments");

    const prescriptionCollections = db.collection("prescriptions");

    const users = db.collection("user");

    const paymentCollections = db.collection("payments");

    // ---admin area started ---
    app.get("/api/get-users", async (req, res) => {
      const result = await users.find().toArray();
      res.send(result);
    });

    app.get("/api/get-doctors", async (req, res) => {
      const result = await doctorCollections.find().toArray();
      res.send(result);
    });

    //change status both in doctor and schedule collection by admin manage doctor--

    app.patch("/api/update-status-doctor", async (req, res) => {
      const doctorId = req.query.doctorId;
      const filter = {
        doctorId,
      };
      const doctorResult = await doctorCollections.updateOne(filter, {
        $set: req.body,
      });

      const scheduleResult = await doctorScheduleCollections.updateMany(
        filter,
        {
          $set: req.body,
        },
      );

      res.send(doctorResult, scheduleResult);
    });

    // suspend user by admin---
    app.patch("/api/suspend-user", async (req, res) => {
      const id = req.query.userId;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await users.updateOne(filter, {
        $set: req.body,
      });
      res.send(result);
    });

    // ---admin area closed ---

    // ----- prescription area started -----

    app.post("/api/add-prescription", async (req, res) => {
      const data = req.body;

      const result = await prescriptionCollections.insertOne(data);
      res.send(result);
    });

    app.get("/api/get-doctor-prescriptions", async (req, res) => {
      const query = {};
      if (req.query.doctorId) {
        query.doctorId = req.query.doctorId;
      }
      const result = await prescriptionCollections.find(query).toArray();
      res.send(result);
    });

    app.patch("/api/update-prescription", async (req, res) => {
      const id = req.query.prescriptionId;
      const data = req.body;

      const filter = {
        _id: new ObjectId(id),
      };
      const updateDoc = {
        $set: data,
      };

      const result = await prescriptionCollections.updateOne(filter, updateDoc);

      res.send(result);
    });

    app.delete("/api/delete-prescription", async (req, res) => {
      const id = req.query.prescriptionId;

      filter = {
        _id: new ObjectId(id),
      };

      const result = await prescriptionCollections.deleteOne(filter);
      res.send(result);
    });
    // ----- prescription area closed -----

    // ---Patient appointment area started ----
    app.get("/api/my-appointment-requests", async (req, res) => {
      const id = req.query.patientId;

      const filter = {
        patientId: id,
      };

      const result = await appointmentCollections.find(filter).toArray();
      res.send(result);
    });

    //delete appointment request from appointments by id
    app.delete("/api/delete-appointment", async (req, res) => {
      const id = req.query.appointmentId;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await appointmentCollections.deleteOne(filter);
      res.send(result);
    });

    app.patch("/api/update-appointment-day", async (req, res) => {
      const id = req.query.appointmentId;
      const filter = {
        _id: new ObjectId(id),
      };

      const result = await appointmentCollections.updateOne(filter, {
        $set: req.body,
      });

      res.send(result);
    });

    // patient payment----
    app.post("/api/add-payment", async (req, res) => {
      try {
        const data = req.body;

        const existingPayment = await paymentCollections.findOne({
          transactionId: data.transactionId,
        });

        if (existingPayment) {
          return res.status(409).json({
            success: false,
            message: "Payment already exists.",
          });
        }

        const result = await paymentCollections.insertOne(data);

        return res.status(201).json({
          success: true,
          message: "Payment added successfully.",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Add Payment Error:", error);

        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    //patient get my payment---

    app.get("/api/get-my-payments", async (req, res) => {
      const id = req.query.patientId;

      const filter = {
        patientId: id,
      };

      const result = await paymentCollections.find(filter).toArray();
      res.json(result);
    });
    // ---Patient appointment area closed ----

    //getting search and filter doctors added schedules for find-doctors page--

    app.get("/api/schedules", async (req, res) => {
      const search = req.query.search;
      const specialization = req.query.specialization;
      const sortBy = req.query.sortBy;

      const page = req.query.page || 1;
      const limit = req.query.limit || 10;

      const skip = (Number(page) - 1) * Number(limit);

      const query = {};

      if (search) {
        query.name = {
          $regex: search,
          $options: "i",
        };
      }

      if (specialization) {
        query.specialization = specialization;
      }

      let sort = {};

      switch (sortBy) {
        case "feeAsc":
          sort = { fee: 1 };
          break;

        case "feeDesc":
          sort = { fee: -1 };
          break;

        case "experienceAsc":
          sort = { experience: 1 };
          break;

        case "experienceDesc":
          sort = { experience: -1 };
          break;

        case "ratingAsc":
          sort = { rating: 1 };
          break;

        case "ratingDesc":
          sort = { rating: -1 };
          break;

        default:
          sort = {};
      }

      const result = await doctorScheduleCollections
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .toArray();

      const totalData = await doctorScheduleCollections.countDocuments(query);
      const totalPage = Math.ceil(totalData / Number(limit));

      res.json({ schedules: result, page: Number(page), totalPage });
    });

  
    // get single schedule for details page
    app.get("/api/single-schedule", async (req, res) => {
      const scheduleId = req.query.scheduleId;

      const result = await doctorScheduleCollections.findOne({
        _id: new ObjectId(scheduleId),
      });
      res.json(result);
    });

    // delete schedule by id---
    app.delete("/api/delete-schedule", async (req, res) => {
      const id = req.query.scheduleId;
      const filter = {
        _id: new ObjectId(id),
      };

      const result = await doctorScheduleCollections.deleteOne(filter);
      res.send(result);
    });
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
            status: "Pending",
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

    app.get("/api/my/doctor", async (req, res) => {
      const query = {};
      if (req.query.doctorId) {
        query.doctorId = req.query.doctorId;
      }
      const result = await doctorCollections.findOne(query);
      res.json(result);
    });

    // adding schedule from schedule dashboard page

    app.post("/api/doctor-schedule", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await doctorScheduleCollections.insertOne(data);
      res.send(result);
    });

    //update schedule from schedule dashboard page
    app.patch("/api/update-schedule", async (req, res) => {
      const scheduleId = req.query.scheduleId;
      const data = req.body;

      const filter = {
        _id: new ObjectId(scheduleId),
      };

      const updateDoc = {
        $set: data,
      };

      const result = await doctorScheduleCollections.updateOne(
        filter,
        updateDoc,
      );

      res.send(result);
    });

    //getting all schedule of logged in doctor-- in schedule page
    app.get("/api/doctor-schedule", async (req, res) => {
      const query = {};
      if (req.query.doctorId) {
        query.doctorId = req.query.doctorId;
      }

      const result = await doctorScheduleCollections.find(query).toArray();
      res.send(result);
    });

    //getting all appointment request of logged in doctor user
    app.get("/api/appointment-requests", async (req, res) => {
      const query = {};

      if (req.query.doctorId) {
        query.doctorId = req.query.doctorId;
        const result = await appointmentCollections.find(query).toArray();
        res.send(result);
      }
    });

    //appointment status update
    app.patch("/api/appointment-status", async (req, res) => {
      const id = req.query.appointmentId;

      const result = await appointmentCollections.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: req.body,
        },
      );

      res.send(result);
    });

    // this is for patient post api

    app.post("/api/add-appointment", async (req, res) => {
      try {
        const { sessionId } = req.body;

        const existing = await appointmentCollections.findOne({
          sessionId: sessionId,
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            message: "Appointment already exists",
          });
        }

        const result = await appointmentCollections.insertOne(req.body);

        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // app.post("/api/add-appointment", async (req, res) => {
    //   const data = req.body;
    //   const {sessionId} = data
    //   const existing = await appointmentCollections.findOne({
    //     sessionId,
    //   })

    //   if(!existing){

    //     const result = await appointmentCollections.insertOne(data);
    //     res.send(result);
    //   }
    // });

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
