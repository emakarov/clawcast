import * as React from "react"
import {
  Radio,
  BookOpen,
  Info,
  Terminal,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useStreams } from "@/hooks/use-streams"

const data = {
  navMain: [
    {
      title: "Browse",
      url: "/",
      icon: Radio,
      isActive: true,
    },
    {
      title: "How to Stream",
      url: "/how-to",
      icon: BookOpen,
    },
    {
      title: "About",
      url: "/about",
      icon: Info,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { streams } = useStreams()

  const liveStreams = streams.map((stream) => ({
    name: stream.title || stream.id,
    url: `/watch/${stream.id}`,
    icon: Terminal,
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Radio className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">ClawCast</span>
                <span className="truncate text-xs">Let your agent go live</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={liveStreams} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
