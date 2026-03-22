import { Radio, MonitorPlay } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { useStreams } from '@/hooks/use-streams'

export function AppSidebar() {
  const location = useLocation()
  const { streams } = useStreams()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <MonitorPlay className="h-5 w-5" />
              <span className="font-bold">aistreamer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/" />} isActive={location.pathname === '/'}>
                  <Radio className="h-4 w-4" />
                  <span>Browse</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {streams.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Live Now</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {streams.slice(0, 5).map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton render={<Link to={`/s/${s.id}`} />} isActive={location.pathname === `/s/${s.id}`}>
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      <span className="truncate text-xs">@{s.user.username} · {s.title || 'Untitled'}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
