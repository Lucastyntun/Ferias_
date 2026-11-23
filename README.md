# Gestão de Férias

Site de gestão de férias (Admin, Chefe, Colaborador) com Supabase.

## Quem estuda o quê

| Parte | Ficheiros | Quem |
| --- | --- | --- |
| Base de dados (tabelas, regras, triggers, RLS) | Supabase (SQL) | Lucas |
| Ligação ao Supabase (login, ler e guardar dados) | `app.js` | Felipe |
| Interface comum (tema, separadores, notificações, calendário) | `js/ui-comum.js` | Lucas + Felipe |
| Interface do Colaborador | `js/ui-colaborador.js` + bloco do Rodrigo em `index.html` | Rodrigo |
| Interface do Chefe | `js/ui-chefe.js` + bloco do Tomás em `index.html` | Tomás |
| Interface do Admin | `js/ui-admin.js` + bloco do Miguel em `index.html` | Miguel |
| Aspeto (cores, tema) | `css/app.css` | todos |

O login (`index.html`, no topo) mantém o aspeto original apresentado ao professor.
`js/demo.js` serve só para ver a interface sem login (`index.html?demo=Admin`).
