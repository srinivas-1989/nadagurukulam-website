// --- Curriculum & Course API ---
const curriculum = crud('disciplines', 'name');
app.get('/api/curriculum', curriculum.list);
app.post('/api/curriculum', curriculum.create);
app.put('/api/curriculum/:id', curriculum.update);
app.delete('/api/curriculum/:id', curriculum.delete);

const courses = crud('courses', 'code');
app.get('/api/courses', courses.list);
app.post('/api/courses', courses.create);
app.put('/api/courses/:id', courses.update);
app.delete('/api/courses/:id', courses.delete);

const course_modules = crud('course_modules', 'module_number');
app.get('/api/course_modules', course_modules.list);
app.post('/api/course_modules', course_modules.create);
app.put('/api/course_modules/:id', course_modules.update);
app.delete('/api/course_modules/:id', course_modules.delete);
