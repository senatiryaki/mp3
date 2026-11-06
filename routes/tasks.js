var Task = require("../models/task");
var User = require("../models/user");
var mongoose = require("mongoose");

module.exports = function (router) {
  router.get("/tasks", async function (req, res) {
    var where, sort, select, skip, limit;

    try {
      where = req.query.where ? JSON.parse(req.query.where) : {};
      sort = req.query.sort ? JSON.parse(req.query.sort) : {};
      select = req.query.select ? JSON.parse(req.query.select) : {};
      skip = req.query.skip === undefined ? 0 : Number(req.query.skip);
      limit = req.query.limit === undefined ? 100 : Number(req.query.limit);

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
        !Number.isInteger(limit) ||
        limit < 0 ||
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
        var count = await Task.countDocuments(where);
        return res.status(200).json({ message: "OK", data: count });
      }

      var tasks = await Task.find(where)
        .sort(sort)
        .select(select)
        .skip(skip)
        .limit(limit);

      res.status(200).json({ message: "OK", data: tasks });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });

  router.post("/tasks", async function (req, res) {
    var {
      name,
      description = "",
      deadline,
      completed = false,
      assignedUser = "",
      assignedUserName,
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof deadline !== "string" ||
      isNaN(Date.parse(deadline)) ||
      typeof description !== "string" ||
      typeof completed !== "boolean" ||
      typeof assignedUser !== "string" ||
      (assignedUser !== "" && !mongoose.isValidObjectId(assignedUser))
    ) {
      return res.status(400).json({
        message: "Invalid task information",
        data: null,
      });
    }

    try {
      var user = null;

      if (assignedUser) {
        user = await User.findById(assignedUser);

        if (!user) {
          return res.status(404).json({
            message: "Assigned user not found",
            data: null,
          });
        }

        if (assignedUserName !== undefined && assignedUserName !== user.name) {
          return res.status(400).json({
            message: "Assigned user name does not match",
            data: null,
          });
        }
      } else if (
        assignedUserName !== undefined &&
        assignedUserName !== "unassigned"
      ) {
        return res.status(400).json({
          message: "Invalid assigned user name",
          data: null,
        });
      }

      var task = await Task.create({
        name: name.trim(),
        description,
        deadline,
        completed,
        assignedUser,
        assignedUserName: user ? user.name : "unassigned",
      });

      if (user && !completed) {
        await User.findByIdAndUpdate(user._id, {
          $addToSet: { pendingTasks: task._id.toString() },
        });
      }

      res.status(201).json({ message: "Task created", data: task });
    } catch (err) {
      res.status(err.name === "ValidationError" ? 400 : 500).json({
        message:
          err.name === "ValidationError"
            ? "Invalid task information"
            : "Internal server error",
        data: null,
      });
    }
  });

  router.get("/tasks/:id", async function (req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        message: "Task not found",
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
      var task = await Task.findById(req.params.id).select(select);

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: null,
        });
      }

      res.status(200).json({ message: "OK", data: task });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });

  router.put("/tasks/:id", async function (req, res) {
    var id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        message: "Task not found",
        data: null,
      });
    }

    try {
      if (!(await Task.exists({ _id: id }))) {
        return res.status(404).json({
          message: "Task not found",
          data: null,
        });
      }
    } catch (err) {
      return res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }

    var {
      name,
      description = "",
      deadline,
      completed = false,
      assignedUser = "",
      assignedUserName,
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof deadline !== "string" ||
      isNaN(Date.parse(deadline)) ||
      typeof description !== "string" ||
      typeof completed !== "boolean" ||
      typeof assignedUser !== "string" ||
      (assignedUser !== "" && !mongoose.isValidObjectId(assignedUser))
    ) {
      return res.status(400).json({
        message: "Invalid task information",
        data: null,
      });
    }

    try {
      var task = await Task.findById(id);

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: null,
        });
      }

      var user = null;

      if (assignedUser) {
        user = await User.findById(assignedUser);

        if (!user) {
          return res.status(404).json({
            message: "Assigned user not found",
            data: null,
          });
        }

        if (assignedUserName !== undefined && assignedUserName !== user.name) {
          return res.status(400).json({
            message: "Assigned user name does not match",
            data: null,
          });
        }
      } else if (
        assignedUserName !== undefined &&
        assignedUserName !== "unassigned"
      ) {
        return res.status(400).json({
          message: "Invalid assigned user name",
          data: null,
        });
      }

      task.name = name.trim();
      task.description = description;
      task.deadline = new Date(deadline);
      task.completed = completed;
      task.assignedUser = assignedUser;
      task.assignedUserName = user ? user.name : "unassigned";

      await task.save();

      await User.updateMany(
        { pendingTasks: id },
        { $pull: { pendingTasks: id } },
      );

      if (user && !completed) {
        await User.findByIdAndUpdate(user._id, {
          $addToSet: { pendingTasks: id },
        });
      }

      res.status(200).json({ message: "Task updated", data: task });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        data: null,
      });
    }
  });

  router.delete("/tasks/:id", async function (req, res) {
    var id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        message: "Task not found",
        data: null,
      });
    }

    try {
      var task = await Task.findByIdAndDelete(id);

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: null,
        });
      }

      await User.updateMany(
        { pendingTasks: id },
        { $pull: { pendingTasks: id } },
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
