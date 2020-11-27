// Compare todo list title alphabetically
const compareByTitle = (itemA, itemB) => {
  let titleA = itemA.title.toLowerCase();
  let titleB = itemB.title.toLowerCase();

  if (titleA < titleB) {
    return -1;
  } else if (titleA > titleB) {
    return 1;
  } else {
    return 0;
  }
}

module.exports = {
  // return the list of todo lists sorted by competion status and title
  sortTodoLists(lists) {
    let done = lists.slice().filter(list => list.isDone());
    let undone = lists.slice().filter(list => !list.isDone());
    done.sort(compareByTitle);
    undone.sort(compareByTitle);
    return [...undone, ...done];
  },

  sortTodos(todoList) {
    let undone = todoList.todos.filter(todo => !todo.isDone());
    let done = todoList.todos.filter(todo => todo.isDone());
    undone.sort(compareByTitle);
    done.sort(compareByTitle);
    return [...undone, ...done];
  }
};