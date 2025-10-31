import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import EnhancedDashboard from "@/pages/dashboard/EnhancedDashboard";
import CandidatesPage from "@/pages/crm/CandidatesPage";
import ClientsPage from "@/pages/crm/ClientsPage";
import VacanciesPage from "@/pages/vacancies/VacanciesPage";
import MatcherPage from "@/pages/matcher/MatcherPage";
import JobDescriptionPage from "@/pages/job-description/JobDescriptionPage";
import CVFormatterPage from "@/pages/cv-formatter/CVFormatterPage";
import TodoPage from "@/pages/todo/TodoPage";
import VtigerIntegrationPage from "@/pages/crm/vtiger/VtigerIntegrationPage";
import VtigerSyncPage from "@/pages/settings/VtigerSyncPage";
import UserManagementPage from "@/pages/admin/UserManagementPage";
import Layout from "@/components/layout/Layout";
import { AuthProvider } from "@/context/AuthContext";
import { VtigerProvider } from "@/context/VtigerContext";
import { ProtectedRoute, PublicRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/auth/LoginPage";
import SetPasswordPage from "@/pages/auth/SetPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";

const BASE_PATH = "/rportal";

function Router() {
  return (
    <WouterRouter base={BASE_PATH}>
      <Switch>
      {/* Public routes */}
      <Route path="/login">
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Route>
      <Route path="/set-password/:token">
        <PublicRoute>
          <SetPasswordPage />
        </PublicRoute>
      </Route>
      <Route path="/reset-password/:token">
        <PublicRoute>
          <ResetPasswordPage />
        </PublicRoute>
      </Route>
      <Route path="/forgot-password">
        <PublicRoute>
          <ForgotPasswordPage />
        </PublicRoute>
      </Route>
      <Route path="/change-password">
        <ProtectedRoute>
          <ChangePasswordPage />
        </ProtectedRoute>
      </Route>

      {/* Protected routes - authentication enabled */}
      <Route path="/">
        <ProtectedRoute>
          <Layout>
            <EnhancedDashboard />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Layout>
            <EnhancedDashboard />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/candidates">
        <ProtectedRoute>
          <Layout>
            <CandidatesPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/clients">
        <ProtectedRoute>
          <Layout>
            <ClientsPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/vacancies">
        <ProtectedRoute>
          <Layout>
            <VacanciesPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/matcher">
        <ProtectedRoute>
          <Layout>
            <MatcherPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/job-descriptions">
        <ProtectedRoute>
          <Layout>
            <JobDescriptionPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/cv-formatter">
        <ProtectedRoute>
          <Layout>
            <CVFormatterPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/todo">
        <ProtectedRoute>
          <Layout>
            <TodoPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/vtiger-integration">
        <ProtectedRoute>
          <Layout>
            <VtigerIntegrationPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/settings/vtiger-sync">
        <ProtectedRoute>
          <Layout>
            <VtigerSyncPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute>
          <Layout>
            <UserManagementPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VtigerProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </VtigerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
