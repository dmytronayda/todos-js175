const express = require('express');
const morgan = require('morgan');
const TodoList = require('./lib/todolist');
const Todo = require('./lib/todo');
const flash = require('express-flash');
const session = require('express-session');
const {
  body,
  validationResult
} = require('express-validator');
const store = require('connect-loki');

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

const {
  sortTodoLists,
  sortTodos
} = require('./lib/sort');

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({
  extended: false
}));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in milliseconds
    path: "/",
    secure: false,
  },
  name: "todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));
app.use(flash());

// Set up persistent session data
app.use((req, res, next) => {
  let todoLists = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }

  req.session.todoLists = todoLists;
  next();
});

app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const loadTodoList = (todoListId, todoLists) => {
  return todoLists.find(todoList => todoList.id === todoListId);
};

const loadTodo = (todoListId, todoId, todoLists) => {
  let todoList = loadTodoList(todoListId, todoLists);
  if (!todoList) return undefined;
  return todoList.todos.find(todo => todo.id === todoId);
};

app.get("/", (req, res) => {
  res.redirect("/lists");
});

app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(req.session.todoLists),
  });
})

// Render new todo lists page
app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

// Create a new todo list
app.post("/lists",
  [
    body("todoListTitle")
    .trim()
    .isLength({
      min: 1
    })
    .withMessage("The list title is required.")
    .isLength({
      max: 100
    })
    .withMessage("List title must be between 1 and 100 characters.")
    .custom((title, { req }) => {
      let todoLists = req.session.todoLists;
      let duplicate = todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage("List title must be unique."),
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.");
      res.redirect("/lists");
    }
  })


// Render individual todo list and its todos
app.get("/lists/:todoListId", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (todoList === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("list", {
      todoList: todoList,
      todos: sortTodos(todoList),
    });
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Render individual todo status
app.post("/lists/:todoListId/todos/:todoId/toggle", (req, res, next) => {
  let {
    todoListId,
    todoId
  } = {
    ...req.params
  };
  let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);

  if (!todo) {
    next(new Error("Not found."));
  } else {
    let title = todo.title;
    if (todo.isDone()) {
      todo.markUndone();
      req.flash("success", `"${title}" marked as NOT done.`);
    } else {
      todo.markDone();
      req.flash("success", `"${title}" marked as done.`);
    }

    res.redirect(`/lists/${todoListId}`);
  };
});

// Render deletion of a todo
app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let {
    todoListId,
    todoId
  } = {
    ...req.params
  };
  let todoList = loadTodoList(+todoListId);
  let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);

  if (!todoList) {
    next(new Error("Not found."));
  } else if (!todo) {
    next(new Error("Not found."));
  } else {
    let index = todoList.findIndexOf(todo);
    let title = todo.title;

    todoList.removeAt(index);

    req.flash("success", `${title} was removed.`);

    res.redirect(`/lists/${todoListId}`);
  };
});

app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error("Not found."));
  } else {
    todoList.markAllDone();
    req.flash("success", "All tasks in this list are marked done.");
    res.redirect(`/lists/${todoListId}`);
  };
});

app.post("/lists/:todoListId/todos",
  [
    body("todoTitle")
    .trim()
    .isLength({
      min: 1
    })
    .withMessage("Title should be at least 1 char long.")
    .isLength({
      max: 100
    })
    .withMessage("Title should be under 100 char long."),
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors
          .array()
          .forEach(message => req.flash("error", message.msg));

        res.render("list", {
          flash: req.flash(),
          todoList: todoList,
          todos: sortTodos(todoList),
          todoTitle: req.body.todoTitle,
        });
      } else {
        let todo = new Todo(req.body.todoTitle);
        todoList.add(todo);
        req.flash("success", "The todo has been created.");
        res.redirect(`/lists/${todoListId}`);
      }
    }
  });

app.get("/lists/:todoListId/edit", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    res.render("edit-list", {
      todoList: todoList,
    });
  };
});

app.post("/lists/:todoListId/destroy", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  let listIdx = req.session.todoLists.indexOf(todoList);

  if (listIdx === -1) {
    next(new Error("Not found."));
  } else {
    req.session.todoLists.splice(listIdx, 1);
    req.flash("success", `Todo List "${todoList.title}" has been deleted.`);
    res.redirect(`/lists`);
  }
});

app.post("/lists/:todoListId/edit",
  [
    body("todoListTitle")
    .trim()
    .isLength({
      min: 1
    })
    .withMessage("Title should be at least 1 char long.")
    .isLength({
      max: 100
    })
    .withMessage("Title should be under 100 char long.")
    .custom((title, { req }) => {
      let duplicate = req.session.todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage("List title must be unique."),
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors
          .array()
          .forEach(message => req.flash("error", message.msg));

        res.render("edit-list", {
          flash: req.flash(),
          todoList: todoList,
          todoListTitle: req.body.todoListTitle,
        });
      } else {
        todoList.title = req.body.todoListTitle;
        req.flash("success", "Todo List has been updated.");
        res.redirect(`/lists/${todoListId}`);
      };
    }
  });

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});