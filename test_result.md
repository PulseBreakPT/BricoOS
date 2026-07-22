#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Remover ícones/botões duplicados no ambiente de trabalho; melhorar responsividade do botão + em desktop e mobile. Depois: criar ficheiros .env para o PIN funcionar."

backend:
  - task: "Criar ficheiros .env (MONGO_URL, DB_NAME, ACCESS_PIN) para o backend arrancar e o PIN validar"
    implemented: true
    working: true
    file: "backend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Backend crashava com KeyError MONGO_URL (não existia .env). Criados backend/.env (MONGO_URL, DB_NAME=test_database, CORS_ORIGINS, ACCESS_PIN=250724) e frontend/.env (REACT_APP_BACKEND_URL, WDS_SOCKET_PORT). Verificado: POST /api/auth/verify-pin com 250724 devolve ok:true+token; fluxo completo no browser (teclado do PIN → desktop) funcional."

frontend:
  - task: "SSS: identidade de SO (boot splash, menu contexto desktop, menu sistema TS c/ Sobre+wallpapers+bloquear, widgets desktop, snap topo, relógio c/ agenda)"
    implemented: true
    working: true
    file: "workspace/BootSplash.jsx, workspace/SystemMenu.jsx, workspace/DesktopWidgets.jsx, lib/osShell.js, Layout.jsx, SystemBar.jsx, StatusCluster.jsx, Window.jsx, index.css"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Validado via screenshots: boot splash após PIN, widgets (agenda/pedidos/correio) no desktop, menu de contexto (clique direito), menu de sistema TS (Sobre, fundos, bloquear ecrã via clearDeviceToken+evento), agenda no relógio. Snap lateral já existia; adicionado snap ao topo=maximizar. Wallpapers persistidos em localStorage (brico_wallpaper)."
  - task: "Remover botões/ícones duplicados no ambiente de trabalho (desktop e mobile)"
    implemented: true
    working: true
    file: "frontend/src/components/Layout.jsx, workspace/SystemBar.jsx, workspace/DesktopOperationsRail.jsx, workspace/MobileHomeSurface.jsx, workspace/OperationalRibbon.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Launcher/Mission Control/Espaços agora só no dock; pesquisa só na SystemBar (removida da titlebar da janela e do rail); atividade só na SystemBar (removida do rail); ribbon de sinais cede lugar ao rail a 2xl (regressa com janela maximizada via body.os-window-max); mobile: drawer abre só pelo 'Mais' do dock (hambúrguer, 'Ver todas' e 'Abrir Control Deck' removidos), pesquisa só no header. Validado com screenshot no desktop após login por PIN."
  - task: "Melhorar responsividade do botão + (FAB) em desktop e mobile"
    implemented: true
    working: true
    file: "frontend/src/pages/Notes.jsx, frontend/src/pages/Suppliers.jsx, frontend/src/index.css"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Variáveis --os-* movidas para :root (FAB em portal no body passa a vê-las); posição a 2xl calculada com var(--os-liveops-width) (corrige >3000px); body.os-window-max reposiciona o + quando a janela maximiza (rail escondido); regras para ecrãs baixos/landscape; focus ring, touch-manipulation e haptics; corrigido import em falta de haptics em Notes.jsx (crash ao clicar no +)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "PIN de acesso: 250724 (ver /app/memory/test_credentials.md). Toda a API exige X-Device-Token exceto /api/auth/*, /api/oauth/*, /api/gmail/connect."