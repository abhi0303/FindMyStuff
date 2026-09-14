import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TermsGuard } from './common/guards/terms.guard';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { FriendshipsModule } from './friendships/friendships.module';
import { ItemsModule } from './items/items.module';
import { MediaModule } from './media/media.module';
import { MembersModule } from './members/members.module';
import { PlacesModule } from './places/places.module';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { StoragesModule } from './storages/storages.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // IMPORTANT: every registered throttler below applies to EVERY route in
    // the app by default — @nestjs/throttler does not scope a named throttler
    // to where it's used with @Throttle(). Any new controller MUST add
    // @SkipThrottle({ auth: true }) at the class level, or it silently
    // inherits the 10-req/5min 'auth' bucket meant only for signup/login.
    // (Found the hard way: every existing controller was missing this.)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.getOrThrow<number>('throttle.ttlSeconds') * 1000,
            limit: config.getOrThrow<number>('throttle.limit'),
          },
          {
            // Auth routes get their own, much stricter bucket.
            name: 'auth',
            ttl: config.getOrThrow<number>('throttle.authTtlSeconds') * 1000,
            limit: config.getOrThrow<number>('throttle.authLimit'),
          },
        ],
      }),
    }),
    PrismaModule,
    MediaModule,
    ActivityModule,
    AuthModule,
    UsersModule,
    FriendshipsModule,
    PlacesModule,
    MembersModule,
    StoragesModule,
    ItemsModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate, then rate-limit, then enforce terms.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: TermsGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
