import { ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { toDateOnly } from "../common/utils/date";
import { PrismaService } from "../prisma/prisma.service";

type RecommendationFilters = {
  date?: string;
  userId?: string;
  anchorProjectId?: string;
};

type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

type RecommendedStop = {
  recommendationRank: number;
  projectId: string;
  projectName: string;
  locationLabel: string | null;
  latitude: number;
  longitude: number;
  assignmentCount: number;
  activeSessionCount: number;
  assignedUsers: Array<{
    userId: string;
    displayName: string;
    hasActiveSession: boolean;
    lastLocationAt: string | null;
  }>;
  currentSortOrder: number;
  distanceFromPreviousKm: number | null;
};

@Injectable()
export class RoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(actor: CurrentUserPayload, filters: RecommendationFilters) {
    this.assertManager(actor);

    const selectedDate = filters.date ?? new Date().toISOString().slice(0, 10);
    const dateOnly = toDateOnly(selectedDate);

    const program = await this.prisma.dailyProgram.findUnique({
      where: { date: dateOnly },
      include: {
        programProjects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                locationLabel: true,
                latitude: true,
                longitude: true
              }
            },
            assignments: {
              where: { isActive: true },
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true
                  }
                },
                workSessions: {
                  where: { endedAt: null },
                  select: { id: true },
                  take: 1
                },
                locationPings: {
                  orderBy: { capturedAt: "desc" },
                  select: {
                    capturedAt: true,
                    latitude: true,
                    longitude: true
                  },
                  take: 1
                }
              }
            }
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!program) {
      return {
        selectedDate,
        anchor: null,
        routeMode: "no-program",
        stops: [],
        skippedProjects: []
      };
    }

    const projectStops = program.programProjects.map((programProject) => ({
      programProjectId: programProject.id,
      projectId: programProject.project.id,
      projectName: programProject.project.name,
      locationLabel: programProject.project.locationLabel,
      latitude: programProject.project.latitude,
      longitude: programProject.project.longitude,
      currentSortOrder: programProject.sortOrder,
      assignments: programProject.assignments.map((assignment) => ({
        userId: assignment.user.id,
        displayName: assignment.user.displayName,
        hasActiveSession: assignment.workSessions.length > 0,
        lastLocationAt: assignment.locationPings[0]?.capturedAt.toISOString() ?? null,
        latestPoint: assignment.locationPings[0]
          ? {
              latitude: assignment.locationPings[0].latitude,
              longitude: assignment.locationPings[0].longitude
            }
          : null
      }))
    }));

    const geocodedStops = projectStops.filter(
      (stop): stop is typeof stop & { latitude: number; longitude: number } =>
        stop.latitude !== null && stop.longitude !== null
    );
    const skippedProjects = projectStops
      .filter((stop) => stop.latitude === null || stop.longitude === null)
      .map((stop) => ({
        projectId: stop.projectId,
        projectName: stop.projectName,
        reason: "missing-coordinates"
      }));

    const anchor = this.resolveAnchor(geocodedStops, filters);

    if (!anchor) {
      return {
        selectedDate,
        anchor: null,
        routeMode: "program-order-fallback",
        stops: geocodedStops.map((stop, index) => ({
          recommendationRank: index + 1,
          projectId: stop.projectId,
          projectName: stop.projectName,
          locationLabel: stop.locationLabel,
          latitude: stop.latitude,
          longitude: stop.longitude,
          assignmentCount: stop.assignments.length,
          activeSessionCount: stop.assignments.filter((assignment) => assignment.hasActiveSession)
            .length,
          assignedUsers: stop.assignments.map((assignment) => ({
            userId: assignment.userId,
            displayName: assignment.displayName,
            hasActiveSession: assignment.hasActiveSession,
            lastLocationAt: assignment.lastLocationAt
          })),
          currentSortOrder: stop.currentSortOrder,
          distanceFromPreviousKm: null
        })),
        skippedProjects
      };
    }

    const recommendations = this.buildNearestNeighborRoute(geocodedStops, anchor.point);

    return {
      selectedDate,
      anchor: {
        strategy: anchor.strategy,
        userId: anchor.userId,
        projectId: anchor.projectId,
        latitude: anchor.point.latitude,
        longitude: anchor.point.longitude
      },
      routeMode: "nearest-neighbor",
      stops: recommendations,
      skippedProjects
    };
  }

  private resolveAnchor(
    stops: Array<{
      projectId: string;
      projectName: string;
      latitude: number;
      longitude: number;
      assignments: Array<{
        userId: string;
        displayName: string;
        hasActiveSession: boolean;
        lastLocationAt: string | null;
        latestPoint: CoordinatePoint | null;
      }>;
    }>,
    filters: RecommendationFilters
  ) {
    if (filters.userId) {
      const candidates = stops
        .flatMap((stop) =>
          stop.assignments
            .filter(
              (assignment): assignment is typeof assignment & {
                latestPoint: CoordinatePoint;
                lastLocationAt: string;
              } => assignment.userId === filters.userId && assignment.latestPoint !== null
            )
            .map((assignment) => ({
              strategy: "latest-user-location" as const,
              userId: assignment.userId,
              projectId: stop.projectId,
              point: assignment.latestPoint,
              lastLocationAt: assignment.lastLocationAt
            }))
        )
        .sort((left, right) => right.lastLocationAt.localeCompare(left.lastLocationAt));

      if (candidates[0]) {
        return candidates[0];
      }
    }

    if (filters.anchorProjectId) {
      const anchorProject = stops.find((stop) => stop.projectId === filters.anchorProjectId);
      if (anchorProject) {
        return {
          strategy: "anchor-project" as const,
          userId: null,
          projectId: anchorProject.projectId,
          point: {
            latitude: anchorProject.latitude,
            longitude: anchorProject.longitude
          }
        };
      }
    }

    return null;
  }

  private buildNearestNeighborRoute(
    stops: Array<{
      projectId: string;
      projectName: string;
      locationLabel: string | null;
      latitude: number;
      longitude: number;
      currentSortOrder: number;
      assignments: Array<{
        userId: string;
        displayName: string;
        hasActiveSession: boolean;
        lastLocationAt: string | null;
      }>;
    }>,
    anchor: CoordinatePoint
  ): RecommendedStop[] {
    const remaining = [...stops];
    const ordered: RecommendedStop[] = [];
    let previousPoint = anchor;

    while (remaining.length > 0) {
      remaining.sort((left, right) => {
        const leftDistance = this.calculateDistanceKm(previousPoint, left);
        const rightDistance = this.calculateDistanceKm(previousPoint, right);

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        return left.currentSortOrder - right.currentSortOrder;
      });

      const nextStop = remaining.shift()!;
      const distanceFromPreviousKm =
        ordered.length === 0
          ? null
          : this.roundDistance(this.calculateDistanceKm(previousPoint, nextStop));

      ordered.push({
        recommendationRank: ordered.length + 1,
        projectId: nextStop.projectId,
        projectName: nextStop.projectName,
        locationLabel: nextStop.locationLabel,
        latitude: nextStop.latitude,
        longitude: nextStop.longitude,
        assignmentCount: nextStop.assignments.length,
        activeSessionCount: nextStop.assignments.filter((assignment) => assignment.hasActiveSession)
          .length,
        assignedUsers: nextStop.assignments.map((assignment) => ({
          userId: assignment.userId,
          displayName: assignment.displayName,
          hasActiveSession: assignment.hasActiveSession,
          lastLocationAt: assignment.lastLocationAt
        })),
        currentSortOrder: nextStop.currentSortOrder,
        distanceFromPreviousKm
      });
      previousPoint = {
        latitude: nextStop.latitude,
        longitude: nextStop.longitude
      };
    }

    return ordered;
  }

  private calculateDistanceKm(origin: CoordinatePoint, destination: CoordinatePoint) {
    const earthRadiusKm = 6371;
    const latitudeDistance = this.toRadians(destination.latitude - origin.latitude);
    const longitudeDistance = this.toRadians(destination.longitude - origin.longitude);
    const originLatitude = this.toRadians(origin.latitude);
    const destinationLatitude = this.toRadians(destination.latitude);

    const haversine =
      Math.sin(latitudeDistance / 2) ** 2 +
      Math.cos(originLatitude) *
        Math.cos(destinationLatitude) *
        Math.sin(longitudeDistance / 2) ** 2;

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  private roundDistance(distanceKm: number) {
    return Number(distanceKm.toFixed(2));
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekir.");
    }
  }
}
