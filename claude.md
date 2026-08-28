1. Filtrar por categoría o "a tu gusto"

Ahora mismo el sistema trae siempre los mods más populares de CurseForge sin ningún filtro. Agrega un selector de categoría, por ejemplo: Tecnología, Magia, Aventura, Decoración, etc., utilizando el categoryId de CurseForge.

También agrega un campo de búsqueda por palabra clave para poder generar tandas temáticas según lo que quiera buscar, en lugar de traer contenido aleatorio o simplemente lo más popular.

2. Guardar el progreso (índice) entre sesiones

Actualmente, cada vez que se abre el panel y se pulsa "Generar", el índice comienza nuevamente desde 0.

Guarda el último indiceInicio utilizado para cada tipo de contenido, preferiblemente en Supabase, para que cada nueva tanda continúe desde donde terminó la anterior.

Esto evitará repetir llamadas innecesarias a la API de CurseForge y permitirá aprovechar mejor la cuota disponible.

3. Aprobación masiva

Agrega la posibilidad de seleccionar varios elementos pendientes mediante checkboxes y aprobarlos todos de una vez.

También agrega un botón como "Aprobar todos los pendientes de esta tanda" para poder aprobar rápidamente 30, 50 o más elementos sin tener que hacerlo uno por uno.

4. Control de cuota diaria

Agrega un contador dentro del panel que permita visualizar cuántas llamadas se han utilizado durante el día y cuántas quedan disponibles.

Por ejemplo:

CurseForge: 40 / 100 llamadas
Groq: 25 / 100 llamadas

El sistema debe controlar las llamadas realizadas y advertir o impedir nuevas generaciones cuando se alcance el límite diario, evitando gastar la cuota accidentalmente o quedarse sin llamadas a mitad de una tanda.