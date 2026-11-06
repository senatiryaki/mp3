var User = require("../models/user");
var Task = require("../models/task");
var mongoose = require("mongoose");

module.exports = function (router) {
  router.get("/users", async function (req, res) {
    var where, sort, select, skip, limit;

    try {
      where = req.query.where ? JSON.parse(req.query.where) : {};
      sort = req.query.sort ? JSON.parse(req.query.sort) : {};
      select = req.query.select ? JSON.parse(req.query.select) : {};
      skip = req.query.skip === undefined ? 0 : Number(req.query.skip);
      limit =
        req.query.limit === undefined ? undefined : Number(req.query.limit);

      if (
        !where ||
        typeof where !== "object" ||
        Array.isArray(where) ||
        !sort ||
        typeof sort !== "object" ||
        Array.isArray(sort) ||
        !select ||
        typeof select !== "object" ||
        Array.isArray(select) ||
        !Number.isInteger(skip) ||
        skip < 0 ||
        (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) ||
        (req.query.count !== undefined &&
          req.query.count !== "true" &&
          req.query.count !== "false")
      ) {
        throw new Error("Invalid query parameters");
      }
    } catch (err) {
      return res.status(400).json({
        message: "Invalid query parameters",
        data: null,
      });
    }

    try {
      if (req.query.count === "true") {
        var count = await User.countDocuments(where);
        return res.status(200).json({ message: "OK", data: count });
      }

      var query = User.find(where).sort(sort).select(select).skip(skip);

      if (limit !== undefined) {
        query.limit(limit);
      }

      var users = await query;

      res.status(200).json({ message: "OK", data: users });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });

  router.post("/users", async function (req, res) {
    var { name, email, pendingTasks = [] } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      !Array.isArray(pendingTasks) ||
      !pendingTasks.every(
        (taskId) =>
          typeof taskId === "string" && mongoose.isValidObjectId(taskId),
      ) ||
      new Set(pendingTasks).size !== pendingTasks.length
    ) {
      return res.status(400).json({
        message: "Invalid user information",
        data: null,
      });
    }

    try {
      var existing = await User.findOne({ email: email.trim() });

      if (existing) {
        return res.status(400).json({
          message: "Email already exists",
          data: null,
        });
      }

      var tasks = await Task.find({ _id: { $in: pendingTasks } });

      if (tasks.length !== pendingTasks.length) {
        return res.status(404).json({
          message: "Referenced task not found",
          data: null,
        });
      }

      if (tasks.some((task) => task.completed)) {
        return res.status(400).json({
          message: "Completed tasks cannot be pending",
          data: null,
        });
      }

      var user = await User.create({
        name: name.trim(),
        email: email.trim(),
        pendingTasks,
      });

      if (pendingTasks.length > 0) {
        await User.updateMany(
          { _id: { $ne: user._id } },
          { $pull: { pendingTasks: { $in: pendingTasks } } },
        );

        await Task.updateMany(
          { _id: { $in: pendingTasks } },
          {
            $set: {
              assignedUser: user._id.toString(),
              assignedUserName: user.name,
            },
          },
        );
      }

      res.status(201).json({ message: "User created", data: user });
    } catch (err) {
      var badRequest = err.code === 11000 || err.name === "ValidationError";

      res.status(badRequest ? 400 : 500).json({
        message: badRequest
          ? "Invalid or duplicate user information"
          : "Internal server error",
        data: null,
      });
    }
  });

  router.get("/users/:id", async function (req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        message: "User not found",
        data: null,
      });
    }

    var select;

    try {
      select = req.query.select ? JSON.parse(req.query.select) : {};
    } catch (err) {
      return res.status(400).json({
        message: "Invalid select parameter",
        data: null,
      });
    }

    try {
      var user = await User.findById(req.params.id).select(select);

      if (!user) {
        return res.status(404).json({
          message: "User not found",
          data: null,
        });
      }

      res.status(200).json({ message: "OK", data: user });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });

  router.put("/users/:id", async function (req, res) {
    var id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        message: "User not found",
        data: null,
      });
    }

    try {
      if (!(await User.exists({ _id: id }))) {
        return res.status(404).json({
          message: "User not found",
          data: null,
        });
      }
    } catch (err) {
      return res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }

    var { name, email, pendingTasks = [] } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      !Array.isArray(pendingTasks) ||
      !pendingTasks.every(
        (taskId) =>
          typeof taskId === "string" && mongoose.isValidObjectId(taskId),
      ) ||
      new Set(pendingTasks).size !== pendingTasks.length
    ) {
      return res.status(400).json({
        message: "Invalid user information",
        data: null,
      });
    }

    try {
      var user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          message: "User not found",
          data: null,
        });
      }

      var tasks = await Task.find({ _id: { $in: pendingTasks } });

      if (tasks.length !== pendingTasks.length) {
        return res.status(404).json({
          message: "Referenced task not found",
          data: null,
        });
      }

      if (tasks.some((task) => task.completed)) {
        return res.status(400).json({
          message: "Completed tasks cannot be pending",
          data: null,
        });
      }

      var existing = await User.findOne({
        email: email.trim(),
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(400).json({
          message: "Email already exists",
          data: null,
        });
      }

      user.name = name.trim();
      user.email = email.trim();
      user.pendingTasks = pendingTasks;

      await user.save();

      await Task.updateMany(
        {
          assignedUser: id,
          completed: false,
          _id: { $nin: pendingTasks },
        },
        {
          $set: {
            assignedUser: "",
            assignedUserName: "unassigned",
          },
        },
      );

      await User.updateMany(
        { _id: { $ne: id } },
        { $pull: { pendingTasks: { $in: pendingTasks } } },
      );

      await Task.updateMany(
        { _id: { $in: pendingTasks } },
        {
          $set: {
            assignedUser: id,
            assignedUserName: user.name,
          },
        },
      );

      await Task.updateMany(
        { assignedUser: id },
        { $set: { assignedUserName: user.name } },
      );

      res.status(200).json({ message: "User updated", data: user });
    } catch (err) {
      res.status(err.code === 11000 ? 400 : 500).json({
        message:
          err.code === 11000 ? "Email already exists" : "Internal server error",
        data: null,
      });
    }
  });

  router.delete("/users/:id", async function (req, res) {
    var id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        message: "User not found",
        data: null,
      });
    }

    try {
      var user = await User.findByIdAndDelete(id);

      if (!user) {
        return res.status(404).json({
          message: "User not found",
          data: null,
        });
      }

      await Task.updateMany(
        { assignedUser: id },
        {
          $set: {
            assignedUser: "",
            assignedUserName: "unassigned",
          },
        },
      );

      res.status(204).send();
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });
};
